# 0004. Load testing, and what it found

Status: accepted. Date: 2026-10-08.

## Context
The earlier decisions claim a seat is never sold twice, the queue is honest and a guest is never charged twice.
The tests behind those claims run a few hundred concurrent requests inside one JVM. A flash sale is thousands of
guests, over HTTP, through a queue, with abandoned holds and failed payments, against real infrastructure with
limits. The claims need to be shown there, with the conditions stated, or they are only claims.

## Decision
- **The test is the whole journey, not one endpoint.** Each of 1,500 virtual users is a guest who joins the
  waiting room, watches their place, is admitted, picks seats from the seat map, holds them and pays. On purpose
  some abandon the hold, use a declined card, hit a provider error, or submit payment twice at once. Supporting
  scenarios isolate one claim each (one seat, 1,000 guests; browsing; 2,000 to 5,000 open live streams; a 30
  second smoke run for CI).
- **Correctness is pass or fail, speed is a measurement.** After every run `loadtest/verify.sh` checks the
  database: no seat sold twice, sold seats equal tickets, paid orders add up, one active hold per guest, and the
  payment provider's records match the orders. A run with a broken invariant fails whatever the latency.
- **Honest conditions.** One laptop, the app capped at 2 CPUs and 1 GB, the mock payment provider with 100 ms of
  latency, a fresh JVM per run warmed with 20 seconds of traffic. Numbers are medians with ranges over repeated
  runs, never the best run. Results state what they do not cover.
- **Reproducible with Docker alone.** The app, Postgres, Redis, Prometheus, Grafana and k6 all run from
  `docker compose` profiles; `loadtest/run.sh` does the rest. CI runs the smoke scenario on every push against a
  real app and database, then the same verifier.
- **Measure first, then change one thing.** Every tuning change was proposed from data and measured with
  alternating runs (A, B, A, B) so drift in the machine hits both sides. A change that did not show a gain was
  dropped.
- **Observability is part of the product.** Metrics are served on a separate management port; the dashboard is
  provisioned from the repo. Custom meters cover holds by result, queue joins and admissions, orders by outcome,
  the payment call, the outbox backlog and the reconciler.
- **Load-test hooks exist only with the `loadtest` profile**, organizer only: guests created in bulk (hashing
  1,500 passwords would spend the CPU being measured) and the provider's charge list for the verifier.

## What it found, and what changed
1. **The harness was the first bottleneck.** Creating guests inside the run was 45% of the app's handling time
   and inflated every early number. Fixed by preparing guests before the clock starts. Lesson: look at where
   time goes (per endpoint) before believing a result.
2. **Failed holds were most of the traffic and cost a full transaction each.** A drop is thousands of requests
   that lose a seat race. They now cost one read-only query instead of a transaction that takes a lock, inserts a
   hold, attempts the claim and rolls back. The conditional claim is unchanged and still decides who gets a
   seat. Alternating cold runs: hold p95 median 756 to 370 ms, with the app handling more failed holds.
3. **The live stream pusher was a single thread.** One thread visiting every open stream took longer than the
   push interval beyond a few thousand streams. Pushes now go out on virtual threads. At 2,000 streams the median
   gap between updates went from 1.49 to 1.12 s (configured: 1 s); at 5,000, from 2.44 to 1.73 s.
4. **A cold JVM stalls a burst.** One run on a freshly started JVM saw a 4.7 s garbage collection and join
   requests timing out. Runs now warm up. This is a deployment concern: warm an instance before sending it
   traffic, and do not scale from zero into a drop.
5. **Tried and dropped.** G1 instead of the default Serial collector (worse hold latency). A larger database
   pool helped a cold JVM and made no measurable difference warm; it stays at 20 because a freshly started
   instance meeting a drop is plausible, with the comment saying exactly that.
6. **A limit found, not fixed.** One instance holds about 2,000 live streams comfortably and degrades past 3,000
   to 5,000 (updates slow to 1.6 s, heap nearly full). Past that the fan-out needs its own service or more
   instances; the state is in Redis, so either works.

## Alternatives considered
- **Gatling or JMeter.** Fine tools, but k6 scripts are plain JavaScript, run from a small Docker image and
  produce per-endpoint thresholds without a project of their own.
- **A cloud load generator and a deployed app.** More realistic network, but not reproducible by a reader for
  free, and Phase 8 covers deployment. The laptop numbers are labeled as such.
- **Asserting only on latency.** Easy, and the wrong thing: the point of the project is that the answers stay
  correct. Latency thresholds exist, but the database check decides pass or fail.
- **Disabling rate limits or caches to look faster.** They are part of the product, so the test respects them.

## Consequences
- The numbers describe this design on this machine. They are evidence the design holds under a realistic burst,
  not a capacity plan.
- Results vary run to run on a laptop. The reports give ranges, and two of five runs of the unthrottled burst
  were still slow after tuning; the improvement is real in the medians and not a clean win.
- The smoke job adds a few minutes to CI, and fails the build if a change breaks an invariant under concurrency.
- Not covered: more than one app instance, a real payment provider, a browser in the loop, long soaks.
