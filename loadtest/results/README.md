# Load test results

Raw numbers behind [docs/performance.md](../../docs/performance.md). Everything here came from `loadtest/run.sh`
and `loadtest/bench.sh`; the `.gitignore` keeps scratch output (logs, prepared guests) out.

| File | What it is |
|---|---|
| `drop-throttled-N.json` | k6 summary of the default drop (50 admissions a second), three warm runs |
| `final.tsv`, `before.tsv` | The unthrottled drop, five warm runs each: after the tuning, and before it (same method) |
| `contention-final-N.json`, `contention-baseline.json` | 1,000 guests on one seat: warm runs after the tuning, and the first run before it (cold) |
| `browse-final.json`, `smoke-final.json` | The browse and smoke scenarios |
| `stream-2000.txt`, `stream-5000.txt` | Open live streams **before** the parallel push; `*-after.txt` is after |
| `cold/` | The same scenarios on a cold JVM, including the early run with the 4.7 s garbage collection (`drop-throttled-2.json`) |
| `pc2-A/B-*.tsv` | Pre-check for failed holds, off (A) and on (B), alternating runs, cold JVM |
| `pool-A/B-*.tsv`, `wpool-A/B-*.tsv` | Pool size 10 (A) vs 20 (B): cold JVM, then warm |
| `gc-A/B-*.tsv` | Default Serial collector (A) vs G1 (B), cold JVM |

Columns in the `.tsv` files: p95 latency in ms per request type, orders paid, hold conflicts, run length in seconds,
the most requests waiting for a database connection, peak app CPU (1.0 is the 2-CPU cap), connection-seconds
used, app CPU-seconds, GC pause seconds, and the number of failed database checks (always 0).

The `.tsv` files before the harness fix are not kept: creating guests inside the timed run was inflating them.
