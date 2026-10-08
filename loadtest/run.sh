#!/bin/bash
# Runs one load scenario against the app in Docker and then checks the database.
#
#   loadtest/run.sh smoke|browse|contention|drop|stream
#
# Starts the app, Postgres, Redis, Prometheus and Grafana if they are not running (Grafana: localhost:3000,
# dashboard "TicketRush"). k6 itself runs in Docker too, so nothing needs installing.
cd "$(dirname "$0")/.." || exit 2
set -a; [ -f .env ] && . ./.env; set +a
SCENARIO="${1:-smoke}"
mkdir -p loadtest/results

case "$SCENARIO" in
  smoke) TITLE=Smoke ;;
  contention) TITLE=Contention ;;
  drop) TITLE=Drop ;;
  browse|stream) TITLE= ;;
  *) echo "usage: loadtest/run.sh smoke|browse|contention|drop|stream"; exit 2 ;;
esac

docker compose --profile app --profile monitoring up -d --build app prometheus grafana || exit 2
printf 'Waiting for the app'
for _ in $(seq 1 90); do
  curl -sf --max-time 3 localhost:8081/actuator/health >/dev/null && break
  printf '.'; sleep 2
done
echo


# A real drop hits an instance that has been running for a while. Every run here starts a fresh JVM, which
# is slow for its first half minute (the JIT compiler competes with the load for the same two CPUs), so warm
# it up with 20 seconds of ordinary traffic first. WARMUP=0 skips this, to measure a cold start on purpose.
if [ "${WARMUP:-1}" = "1" ] && [ "$SCENARIO" != "smoke" ] && [ "$SCENARIO" != "stream" ]; then
  echo "Warming up the app (20 seconds)"
  loadtest/prepare.sh 20 > /dev/null || exit 2
  docker compose --profile load run --rm -e SMOKE_DURATION=20s k6 run --quiet /loadtest/smoke.js > /dev/null 2>&1
fi

case "$SCENARIO" in
  smoke) GUESTS_NEEDED=20 ;;
  contention) GUESTS_NEEDED="${GUESTS:-1000}" ;;
  drop) GUESTS_NEEDED="${GUESTS:-1500}" ;;
  stream) GUESTS_NEEDED="${STREAMS:-2000}" ;;
  *) GUESTS_NEEDED= ;;
esac
if [ -n "$GUESTS_NEEDED" ]; then loadtest/prepare.sh "$GUESTS_NEEDED" || exit 2; fi

if [ "$SCENARIO" = "stream" ]; then
  java loadtest/StreamLoad.java "${STREAMS:-2000}" "${STREAM_SECONDS:-30}"
  exit $?
fi

echo "Running $SCENARIO. Watch it at http://localhost:3000 (dashboard TicketRush)."
docker compose --profile load run --rm -e GUESTS="${GUESTS:-}" k6 run --quiet "/loadtest/$SCENARIO.js"
K6=$?
echo
echo "Checking the database"
loadtest/verify.sh $TITLE
V=$?
[ "$K6" = "0" ] && [ "$V" = "0" ]
