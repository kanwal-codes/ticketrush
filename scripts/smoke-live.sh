#!/usr/bin/env bash
# Checks a running TicketRush (the live site, or the local web container) for the things that must be closed and the
# things that must work. Usage:  scripts/smoke-live.sh https://ticketrush-web.fly.dev [organizer-email organizer-password]
# It creates one throwaway guest account, and trips the sign-in rate limit for this machine's address for a minute.
set -u
BASE="${1:?Usage: smoke-live.sh BASE_URL [organizer-email organizer-password]}"
BASE="${BASE%/}"
fail=0
ok()   { printf '  ok    %s\n' "$1"; }
bad()  { printf '  FAIL  %s\n' "$1"; fail=1; }
check() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (wanted $3, got $2)"; fi; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
body() { curl -s "$@"; }
header() { curl -sI "$2" | tr -d '\r' | grep -i "^$1:" | head -1; }

echo "Smoke test: $BASE"
echo "The site works"
check "home page answers" "$(code "$BASE/")" 200
body "$BASE/" | grep -qi "<title>" && ok "home page is the web app" || bad "home page has no title"
check "health check answers" "$(code "$BASE/healthz")" 200
events="$(body "$BASE/api/events?size=1")"
echo "$events" | grep -q '"items"' && ok "the events API answers with a list" || bad "the events API did not answer with a list"

echo "Security headers"
for h in content-security-policy x-content-type-options x-frame-options referrer-policy permissions-policy cross-origin-opener-policy; do
  [ -n "$(header "$h" "$BASE/")" ] && ok "$h is set" || bad "$h is missing"
done

echo "What must not be reachable"
for path in /swagger-ui/index.html /swagger-ui.html /v3/api-docs /actuator /actuator/health /actuator/prometheus /dev/load/guests; do
  out="$(curl -s -D - "$BASE$path" | tr -d '\r')"
  if echo "$out" | grep -qi '^content-type: *application/json' || echo "$out" | grep -qi 'openapi\|swagger-ui-bundle\|"status":"UP"\|# HELP'; then bad "$path is being served"; else ok "$path is not served"; fi
done
check "organizer API refuses anonymous callers" "$(code "$BASE/api/organizer/events")" 401

echo "A guest cannot use organizer tools"
email="smoke-$(date +%s)-$RANDOM@example.org"
reg="$(curl -s -w '\n%{http_code}' -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' -d "{\"email\":\"$email\",\"password\":\"smoke-test-pass\",\"displayName\":\"Smoke\"}")"
code_reg="${reg##*$'\n'}"
if [ "$code_reg" = 400 ] && echo "$reg" | grep -qi "complete the check"; then
  # The bot check is on, so a script cannot make an account. That is the point; the guest-role checks need one, so skip.
  ok "sign-up is refused without the bot check's answer"
  echo "  skip  guest-role checks (they need an account, and the bot check is on)"
else
  check "a guest can sign up" "$code_reg" 201
  token="$(body -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$email\",\"password\":\"smoke-test-pass\"}" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')"
  [ -n "$token" ] && ok "a guest can sign in" || bad "a guest could not sign in"
  check "organizer reads are forbidden to a guest" "$(code "$BASE/api/organizer/events" -H "Authorization: Bearer $token")" 403
  check "creating a venue is forbidden to a guest" "$(code -X POST "$BASE/api/venues" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' -d '{}')" 403
  check "a sign-in can be renewed" "$(code -X POST "$BASE/api/auth/refresh" -H "Authorization: Bearer $token")" 200
fi
check "renewing needs a token" "$(code -X POST "$BASE/api/auth/refresh")" 401

if [ -n "${2:-}" ] && [ -n "${3:-}" ]; then
  echo "The organizer can sign in"
  otoken="$(body -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$2\",\"password\":\"$3\"}" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')"
  [ -n "$otoken" ] && ok "organizer signs in" || bad "organizer could not sign in"
  check "organizer can read their events" "$(code "$BASE/api/organizer/events" -H "Authorization: Bearer $otoken")" 200
fi

echo "Guessing passwords is slowed down"
limited=0
for i in $(seq 1 30); do
  c="$(code -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"email":"nobody@example.org","password":"wrong-password"}')"
  [ "$c" = 429 ] && limited=1 && break
done
[ "$limited" = 1 ] && ok "repeated bad sign-ins get 429" || bad "30 bad sign-ins in a row were never limited"

echo
[ "$fail" = 0 ] && echo "All checks passed." || echo "Some checks FAILED."
exit "$fail"
