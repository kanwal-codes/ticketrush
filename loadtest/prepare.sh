#!/bin/bash
# Creates N guests in one request and saves their ids and tokens to loadtest/results/guests.json, so the
# measured run starts with every guest ready and the app is not busy with setup while it is being timed.
#
#   loadtest/prepare.sh 1500
cd "$(dirname "$0")/.." || exit 2
set -a; [ -f .env ] && . ./.env; set +a
N="${1:?how many guests}"
BASE_URL="${BASE_URL:-http://localhost:8080}"
PASSWORD="${ORGANIZER_PASSWORD:-${DEMO_ORGANIZER_PASSWORD:-}}"
mkdir -p loadtest/results
TOKEN=$(curl -s --max-time 15 -H 'Content-Type: application/json' \
  -d "{\"email\":\"${ORGANIZER_EMAIL:-organizer@ticketrush.dev}\",\"password\":\"$PASSWORD\"}" "$BASE_URL/api/auth/login" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])') || { echo "Could not sign in as the organizer"; exit 2; }
curl -s --max-time 120 -X POST -H "Authorization: Bearer $TOKEN" "$BASE_URL/dev/load/guests?count=$N" \
  -o loadtest/results/guests.json -w 'prepared guests: HTTP %{http_code}\n'
python3 -c 'import json;print(len(json.load(open("loadtest/results/guests.json"))),"guests in loadtest/results/guests.json")'
