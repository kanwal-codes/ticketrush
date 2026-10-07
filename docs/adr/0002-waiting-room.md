# 0002. The waiting room

Status: accepted. Date: 2026-10-07.

## Context
On a hot drop, far more people arrive in the first second than the seat database can serve. Without a gate
they all hit the hold endpoint at once. The gate has to be fair and honest (people see a real place in line),
steady (the database sees a controlled trickle), and cheap enough that checking your place does not become the
new bottleneck. A refresh or a dropped connection must not cost anyone their place.

## Decision
- **The line is a Redis sorted set per event.** The score is a global arrival counter (`INCR`), not a
  timestamp, so there are no ties. Joining uses `ZADD NX`: joining twice or refreshing keeps the original
  place. A guest's place is `ZRANK + 1`, so it is exact and survives any reconnect, because it lives in Redis
  and not in a connection.
- **First come, first served.** Arrival order decides, which is what the product promises. Joining is allowed
  from when the waiting room opens, but nobody is admitted before the sale starts.
- **Admission is one atomic Lua script**, run by a scheduler every second. It drops expired admissions, works
  out how many more fit inside (a cap on guests admitted at once), takes that many from the front of the line
  and writes them into an `admitted` sorted set scored by when their admission ends. Redis runs a script as a
  single step, so a guest is never taken from the line without being admitted, and several app instances
  running it at once cannot admit anyone twice. A `SET NX PX` guard per event lets instances share one round
  per interval.
- **The proof of admission is a signed token** (JWT, same key as sign-in, scope `admission`, naming the guest
  and the event, valid for 10 minutes). The hold endpoint verifies it without asking Redis, so seat holds never
  depend on the queue being reachable. A sign-in token, another guest's token and another event's token do not
  pass. Expiry is also checked against the application clock.
- **Live updates use Server-Sent Events**, one-way over plain HTTP with automatic reconnect. The stream sends
  the same status JSON the status endpoint returns and closes when the guest is admitted. Because state is in
  Redis, a dropped stream loses nothing.
- **Rate limits** (a Redis counter per guest per minute) protect join and status. The stream is the intended
  way to watch your place, so it is not limited.
- **The waiting room is per event** (`queue_enabled`), so ordinary events skip it entirely.
- **Module boundary:** the `queue` module depends on `catalog`, never the reverse. Catalog defines the
  `AdmissionCheck` port and queue implements it, and queue asks catalog for event facts through its own port.

## Alternatives considered
- **A randomized lottery for everyone who joined before the sale.** Fairer against people who simply refresh
  fastest, but it breaks the "first come, first served" promise and hides your place. Worth revisiting as an
  option per event.
- **Only a token bucket or rate limit on the hold endpoint.** Protects the database but gives no order and no
  honest place, so people hammer the endpoint and the unlucky never know why.
- **WebSockets.** Two-way, but nothing here needs the client to talk. SSE is simpler, works through proxies
  and reconnects by itself.
- **Admission state in Postgres.** Possible, but a flash-sale line is constant small writes and rank queries,
  which is what Redis sorted sets are for.

## Consequences
- Position and queue length are exact. Only the wait time is an estimate (people ahead divided by the
  configured admission rate) and is labeled as one.
- Bots are not stopped. One account is one place and joining twice does nothing, but there is no CAPTCHA and
  no identity check. That is a deliberate gap for a later phase.
- A guest whose admission runs out has to join again at the back.
- The `waiting` set and the stream list are in-process or per-Redis, so very large queues will want the
  streaming fan-out moved to its own service. Phase 6 measures where the limits are.
