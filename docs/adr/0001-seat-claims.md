# 0001. How a seat is claimed

Status: accepted. Date: 2026-10-07.

## Context
When tickets go on sale, thousands of people ask for the same seats at the same moment. A seat must never be
held or sold twice, and a guest asking for several seats must get all of them or none. The answer has to stay
correct across threads and across several app instances, and it has to fail fast, because a slow "no" during a
sale just makes the queue longer.

## Decision
Postgres is the single source of truth. A claim is one SQL statement:

```sql
with locked as (
  select seat_id from event_seat
  where event_id = :event and seat_id in (:seats)
    and (status = 'AVAILABLE' or (status = 'HELD' and held_until <= :now))
  order by seat_id
  for update skip locked)
update event_seat set status = 'HELD', hold_id = :hold, held_until = :until
from locked where event_seat.event_id = :event and event_seat.seat_id = locked.seat_id
returning event_seat.seat_id
```

If fewer seats come back than were asked for, the service throws and the transaction rolls back, so the claim is
all or nothing.

- `for update skip locked`: a seat that another request is working on is skipped instead of waited for. The claim
  fails immediately and requests never queue behind each other on a hot seat.
- `order by seat_id`: every request takes locks in the same order, so two requests cannot deadlock each other.
- The status test includes `held_until <= :now`: a seat whose hold ran out is claimable right away, and the read
  queries show it as available. The scheduled sweeper only tidies rows. Correctness does not depend on it.
- One active hold per guest per event is enforced twice: by a per-guest advisory lock that serializes that guest's
  requests, and by a partial unique index in the database.
- A new hold replaces the guest's previous one in the same transaction. If the new claim fails, everything rolls
  back and the guest keeps the old hold.

## Alternatives considered
- **Optimistic locking (a version column).** Correct, but under a flash sale most attempts on a hot seat would
  fail late, after doing the work, and need retries.
- **`select ... for update` without `skip locked`.** Correct, but requests queue on the hot seat and hold
  connections while they wait. Multi-seat requests also need careful ordering to avoid deadlocks.
- **A Redis lock per seat.** Fast, but then there are two systems that must agree, and a crash between them can
  leave a seat locked or double-sold. Redis is used where it fits: the waiting room (Phase 4).

## Consequences
- The guarantee lives in one statement and is tested by hammering it: 300 guests for one seat, 500 guests for
  overlapping pairs, retry storms, and races on a just-expired seat.
- Throughput is bounded by Postgres row updates, which is fine for the size of event this targets and will be
  measured in Phase 6.
- The hold code sits in the `catalog` module because it shares `event_seat` with it. If it grows, it can move to
  its own module that owns the table.
