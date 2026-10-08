# Performance and correctness under load

This page is what the load tests found, with the conditions stated, so the numbers can be checked and not just
believed. Method and reasoning: [decision record 0004](adr/0004-load-testing.md).

![Guests are let in in the order they joined](img/drop.svg)

## Conditions (read these first)

| | |
|---|---|
| Machine | One MacBook, 10 cores, 16 GB. Docker Desktop VM with 10 CPUs and 8 GB |
| App | One container, **capped at 2 CPUs and 1 GB** (JVM heap about 690 MB), Java 21 with virtual threads |
| Postgres | One container, capped at 2 CPUs. Redis, Prometheus, Grafana and k6 share the machine, uncapped. k6's own CPU was not recorded |
| Payment provider | The mock, with 100 ms of simulated latency per call. Real providers are slower and less steady |
| Each run | Starts a fresh JVM, warmed with 20 seconds of ordinary traffic. The cold-start case is reported separately below |
| Code | Runs after the tuning were on commit `19628c8`. "Before" runs were on `2e25d00`, same method |
| Test settings | Hold time 60 s (so abandoned holds are resold), admission lasts 2 minutes, 1,000 seats at $96 |

These are single-machine numbers for a design, not capacity claims for a deployment. Run-to-run spread is wide
on a laptop, so tables give medians and ranges, and a single run is never the headline.

## The correctness claim

Every run in `loadtest/results` ended with `loadtest/verify.sh` reporting **0 invariant violations**. Latency
never decides that: a fast run with a broken invariant fails. It checks, as SQL against the database after the
load stops:

- no seat has two live tickets, and sold seats equal live tickets
- paid orders add up to their tickets (face plus fees); no tickets exist on unpaid orders
- no guest has two active holds for an event; no live hold holds a different number of seats than it says
- no hold has two live orders
- the payment provider's record of charges matches the orders exactly: every paid, refunding or refunded order
  was charged, and no other order was

| Scenario | Result |
|---|---|
| 1,000 guests, one seat, same instant (7 recorded runs) | exactly 1 got the seat and 999 were told it was taken, every time |
| 1,500 guests, 1,000 seats, full journey (waiting room, hold, pay), default settings, 3 warm runs | 868 to 880 seats sold, 0 violations, 0 server errors. The seats not sold were held by unresolved payments and abandoned holds (for example 874 sold + 30 + 96 = 1,000) |
| The same with the queue not throttling, 5 runs | 0 violations in all |

The drop is not polite on purpose. Of the guests who get seats, 10% abandon the hold, 5% use a declined card and
then a good one, 3% hit a provider error that leaves the order pending, and 5% submit payment twice at the same
instant with the same key. All of it ended consistent.

## The default drop (1,500 guests, 1,000 seats)

The waiting room admits 50 guests a second, with at most 300 inside at once. Guests arrive over 40 seconds, the
sale opens at 25 seconds, and the last guest is through about 60 seconds in. Three warm runs:

| p95 latency | join the line | check place | seat map | hold seats | pay (mock adds 100 ms) |
|---|---|---|---|---|---|
| Runs 1 / 2 / 3 | 3 / 4 / 3 ms | 2 / 2 / 2 ms | 1 / 1 / 1 ms | 3 / 3 / 3 ms | 111 / 110 / 112 ms |

About 437 orders were paid in each run. Between 1,100 and 1,300 hold attempts lost a seat race and were retried,
and 920 to 940 guests reached the front only to see "sold out".

**It is fair.** The chart above shows, per block of 100 places, when those guests were let in. Earlier places
always went in earlier, in all three runs. The measured line sits about a second above the 50-a-second
prediction (polling and the one second admission tick) and bends upward later. The likely reason is the cap of
300 guests inside at once: guests who abandon a hold keep their place inside until the admission expires (2
minutes in this test), so the free room shrinks as the sale goes on. That is a real property of the design, and a
shorter admission time or an explicit "leave" would reduce it.

## When the queue does not protect the app (500 admissions a second, 1,500 inside)

This removes the throttle, so the app takes the whole burst at once. Five runs each, same warm method:

| | Before tuning (median, range) | After tuning (median, range) |
|---|---|---|
| Hold seats, p95 | 316 ms (81 to 376) | 34 ms (15 to 452) |
| Pay, p95 | 345 ms (214 to 460) | 151 ms (140 to 389) |
| Join the line, p95 | 16 ms (13 to 36) | 8 ms (4 to 37) |
| Orders paid | 434 (422 to 442) | 439 (425 to 446) |
| Hold conflicts handled | 4,659 | 5,321 |
| App CPU per run | 39 s | 38 s |

Read this with care: the ranges overlap, and two of the five "after" runs had hold p95 above 300 ms. The medians
improved and the app handled about 14% more failed-hold traffic for the same CPU, but the honest summary is
"better and noisier than a clean win". Tuning steps are in the decision record.

## One seat, 1,000 guests at the same instant

| | Hold p95 | Hold mean | Longest | Winners |
|---|---|---|---|---|
| Before tuning, cold JVM | 2,186 ms | 1,561 ms | 2,252 ms | 1 |
| After tuning, cold JVM (3 runs) | 972 to 1,502 ms | 547 to 857 ms | 1,040 to 1,563 ms | 1 |
| After tuning, warm (3 runs) | 302 to 454 ms | 135 to 279 ms | 455 to 479 ms | 1 |

The first row mixes old code with a cold start, so it overstates the gain from code alone; the second row is the
fair comparison for the code change, and the third shows what warming up does.

## Browsing

500 virtual users on the event list, an event page and its seat map, mostly repeat visits sending `If-None-Match`
(15,700 requests, 160 a second, 0 errors, every check passed). p95: list 2.9 ms, event page 6.7 ms, seat map
5.8 ms. This is the cache and 304 path working, not a database benchmark.

## Live place in line (server-sent events)

Guests open a stream and get their place every second. 30 seconds of open streams (`loadtest/StreamLoad.java`):

| Open streams | Opened | First update p95 | Gap between updates, median / p99 | App heap | App CPU |
|---|---|---|---|---|---|
| 2,000 | 2,000, none failed | 1.3 s | 1.17 s / 1.48 s | 374 MB | 33% |
| 5,000 | 5,000, none failed | 4.2 s | 1.60 s / 2.89 s | 661 MB of about 690 | 42% |

At 2,000 streams updates arrive close to the configured second. At 5,000 everyone stays connected but updates
slow to about 1.6 seconds and the heap is nearly full, so one instance at these limits tops out around 3,000 to
5,000 streams. Before the pushes were parallelised the same tests gave a 1.49 s median gap at 2,000 and 2.44 s at
5,000. Beyond that, the stream fan-out would be its own service or more instances; the state is in Redis, so
either works.

## Things that went wrong, and what they taught

- **My test harness inflated every early number.** Creating each guest inside the run was 45% of the app's
  handling time, because 1,500 virtual users did it at the same instant. Guests are now created before the
  timed run starts.
- **A cold JVM can stall a burst.** One early run, the first after a restart, had a 4.7 second garbage
  collection and join requests timing out at 30 seconds (kept in `loadtest/results/cold/`). The container's two CPUs were busy compiling code and
  serving the burst, and the collector was starved. Runs now warm up first. A real deployment would warm an
  instance before sending it traffic.
- **A plausible fix did nothing at first.** I expected failed holds (most requests in a drop) to dominate the
  database, and added a cheap read-only check ahead of the transaction. It only showed a gain once the harness
  was fixed.
- **Two tried-and-dropped changes.** G1 instead of the default Serial collector was worse for hold latency
  (median p95 454 ms vs 285 ms). Pool size 20 beat 10 on a cold JVM but made no measurable difference warm.

## Not covered

One instance only (no multi-instance run), the mock payment provider, no browser in the loop, no network latency
between guests and the app, no hours-long soak, and no run on hardware other than this laptop.

## Reproduce

```bash
cp .env.example .env              # set the passwords and JWT_SECRET
loadtest/run.sh smoke             # 30 seconds, strict thresholds, also runs in CI
loadtest/run.sh drop              # the default drop; watch http://localhost:3000, dashboard "TicketRush"
loadtest/run.sh contention        # 1,000 guests, one seat
loadtest/run.sh browse
loadtest/run.sh stream            # STREAMS=5000 loadtest/run.sh stream
LOAD_ADMIT_PER_SECOND=500 LOAD_MAX_ADMITTED=1500 loadtest/bench.sh mine 5     # the unthrottled drop, five times
```

Each run starts the app, Postgres, Redis, Prometheus and Grafana in Docker, warms the app up, runs k6 in Docker,
then checks the database. Raw k6 summaries are in `loadtest/results/`.
