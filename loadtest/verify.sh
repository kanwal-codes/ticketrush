#!/bin/bash
# Checks the database after a load run. Every number below must be 0, whatever the latency was.
#
#   loadtest/verify.sh [event title]     e.g. loadtest/verify.sh Drop
#
# With a title it also checks that event on its own (the latest event with that title) and compares the
# payment provider's records with the orders. Needs the app's loadtest profile and ORGANIZER_PASSWORD (or
# DEMO_ORGANIZER_PASSWORD in .env) for the provider comparison.
# PSQL_CMD says how to reach Postgres. By default it is the compose container.
cd "$(dirname "$0")/.." || exit 2
set -a; [ -f .env ] && . ./.env; set +a
TITLE="${1:-}"
BASE_URL="${BASE_URL:-http://localhost:8080}"
PSQL_CMD="${PSQL_CMD:-docker compose exec -T postgres psql -U ${POSTGRES_USER:-ticketrush} -d ${POSTGRES_DB:-ticketrush}}"
q() { $PSQL_CMD -tA -c "$1" | tr -d '[:space:]'; }

violations=0
check() { # name, sql returning a count
  local n; n=$(q "$2")
  printf '  %-62s %s\n' "$1" "$n"
  [ "$n" = "0" ] || violations=$((violations + 1))
}

echo "Whole database"
check "seats with two live tickets" \
  "select count(*) from (select 1 from ticket where status <> 'VOID' group by event_id, seat_id having count(*) > 1) x"
check "paid orders whose tickets do not add up to the total" \
  "select count(*) from ticket_order o where o.status = 'PAID' and o.total_cents <> (select coalesce(sum(face_cents + fee_cents), 0) from ticket where order_id = o.id)"
check "tickets on orders that are not paid" \
  "select count(*) from ticket t join ticket_order o on o.id = t.order_id where o.status <> 'PAID'"
check "live tickets whose seat is not marked sold" \
  "select count(*) from ticket t join event_seat es on es.event_id = t.event_id and es.seat_id = t.seat_id where t.status <> 'VOID' and es.status <> 'SOLD'"
check "guests with more than one active hold for an event" \
  "select count(*) from (select 1 from seat_hold where status = 'ACTIVE' group by event_id, user_id having count(*) > 1) x"
check "seats held by a hold that is released or paid for" \
  "select count(*) from event_seat es join seat_hold h on h.id = es.hold_id where es.status = 'HELD' and h.status <> 'ACTIVE'"
check "live holds that do not hold the number of seats they say" \
  "select count(*) from seat_hold h where h.status = 'ACTIVE' and h.expires_at > now() and h.seat_count <> (select count(*) from event_seat where hold_id = h.id and status = 'HELD')"
check "holds with more than one live order" \
  "select count(*) from (select 1 from ticket_order where status in ('PENDING_PAYMENT','PAID','REFUNDING') group by hold_id having count(*) > 1) x"

if [ -n "$TITLE" ]; then
  EVENT=$(q "select coalesce(max(id), 0) from event where title = '$TITLE'")
  if [ "$EVENT" = "0" ]; then echo "No event titled '$TITLE'"; exit 2; fi
  echo "Event $EVENT ('$TITLE')"
  SOLD=$(q "select count(*) from event_seat where event_id = $EVENT and status = 'SOLD'")
  TICKETS=$(q "select count(*) from ticket where event_id = $EVENT and status <> 'VOID'")
  PAID=$(q "select count(*) from ticket_order where event_id = $EVENT and status = 'PAID'")
  CAP=$(q "select count(*) from event_seat where event_id = $EVENT")
  printf '  %-62s %s of %s\n' "seats sold" "$SOLD" "$CAP"
  printf '  %-62s %s\n' "tickets" "$TICKETS"
  printf '  %-62s %s\n' "paid orders" "$PAID"
  check "sold seats minus live tickets" "select abs($SOLD - $TICKETS)"
  check "sold seats above capacity" "select greatest($SOLD - $CAP, 0)"

  if [ "$PAID" != "0" ] || [ "$(q "select count(*) from ticket_order where event_id = $EVENT")" != "0" ]; then
    PASSWORD="${ORGANIZER_PASSWORD:-${DEMO_ORGANIZER_PASSWORD:-}}"
    TOKEN=$(curl -s --max-time 10 -H 'Content-Type: application/json' \
      -d "{\"email\":\"${ORGANIZER_EMAIL:-organizer@ticketrush.dev}\",\"password\":\"$PASSWORD\"}" \
      "$BASE_URL/api/auth/login" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("accessToken",""))' 2>/dev/null)
    if [ -z "$TOKEN" ]; then
      echo "  (payment provider comparison skipped: could not sign in as the organizer)"
    else
      STATS=$(curl -s --max-time 10 -H "Authorization: Bearer $TOKEN" "$BASE_URL/dev/load/payments")
      ORDERS=$($PSQL_CMD -tA -F, -c "select id, status from ticket_order where event_id = $EVENT")
      N=$(STATS="$STATS" ORDERS="$ORDERS" python3 - <<'PY'
import json, os
charged = set(json.loads(os.environ["STATS"])["chargedKeys"])
mismatch = 0
for line in os.environ["ORDERS"].splitlines():
    if not line.strip():
        continue
    order_id, status = line.strip().split(",")
    was_charged = f"order-{order_id}" in charged
    should_be = status in ("PAID", "REFUNDING", "REFUNDED")
    if was_charged != should_be:
        mismatch += 1
        print(f"order {order_id} is {status} but charged={was_charged}", file=__import__("sys").stderr)
print(mismatch)
PY
)
      printf '  %-62s %s\n' "orders whose payment state disagrees with the provider" "$N"
      [ "$N" = "0" ] || violations=$((violations + 1))
    fi
  fi
fi

echo
if [ "$violations" = "0" ]; then echo "0 invariant violations"; exit 0; fi
echo "$violations CHECKS FAILED"; exit 1
