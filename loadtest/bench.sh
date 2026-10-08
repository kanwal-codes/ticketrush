#!/bin/bash
# Runs the unthrottled drop several times and records the numbers that matter, to compare a change with the
# one before it. A single run proves little; the spread across runs is the honest figure.
#
#   loadtest/bench.sh <label> [runs]      results go to loadtest/results/<label>.tsv
cd "$(dirname "$0")/.." || exit 2
LABEL="${1:?label, e.g. baseline}"
RUNS="${2:-3}"
OUT="loadtest/results/$LABEL.tsv"
export LOAD_ADMIT_PER_SECOND="${LOAD_ADMIT_PER_SECOND:-500}" LOAD_MAX_ADMITTED="${LOAD_MAX_ADMITTED:-1500}"
printf 'run\thold_p95_ms\tpay_p95_ms\tjoin_p95_ms\tplace_p95_ms\tseats_p95_ms\torders_paid\tconflicts\tseconds\tpool_waiting_max\tacquire_max_s\tcpu_peak\tviolations\n' > "$OUT"

prom() { curl -s --max-time 5 --get localhost:9090/api/v1/query --data-urlencode "query=$1" \
  | python3 -c 'import sys,json;r=json.load(sys.stdin)["data"]["result"];print(round(float(r[0]["value"][1]),3) if r else 0)'; }

for i in $(seq 1 "$RUNS"); do
  START=$(date +%s)
  loadtest/run.sh drop > "loadtest/results/$LABEL-$i.log" 2>&1 < /dev/null
  # Only this run: the window starts when it started, so the previous run does not leak in.
  W=$(( $(date +%s) - START ))
  VIOL=$(grep -c "CHECKS FAILED" "loadtest/results/$LABEL-$i.log")
  cp loadtest/results/drop-summary.json "loadtest/results/$LABEL-$i.json"
  ROW=$(python3 - "loadtest/results/$LABEL-$i.json" <<'PY'
import json, sys
m = json.load(open(sys.argv[1]))["metrics"]
p95 = lambda n: round(m["http_req_duration{name:%s}" % n]["values"]["p(95)"], 1)
print("\t".join(str(x) for x in [p95("hold"), p95("pay"), p95("join"), p95("place"), p95("seats"),
      int(m["orders_paid"]["values"]["count"]), int(m["hold_conflicts"]["values"]["count"]),
      round(m["iteration_duration"]["values"]["max"] / 1000, 1)]))
PY
)
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$i" "$ROW" "$(prom "max_over_time(hikaricp_connections_pending[${W}s])")" \
    "$(prom "max_over_time(hikaricp_connections_acquire_seconds_max[${W}s])")" "$(prom "max_over_time(process_cpu_usage[${W}s])")" "$VIOL" >> "$OUT"
done
column -t -s$'\t' "$OUT"
