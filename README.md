# TicketRush

Flash-sale ticketing that stays correct under a traffic spike: a waiting room, live seat maps, timed seat holds, and zero oversold seats, backed by a published load test.

> Work in progress. Done: sign-in, the event and seat catalog, seat holds, and the waiting room. Next: checkout and tickets.

## Stack

- **Backend:** Java 21 (virtual threads), Spring Boot 4, Spring Security with JWT, PostgreSQL 16, Redis 7, Flyway
- **Frontend:** React, TypeScript, Vite (not started)
- **Quality:** JUnit 5, Testcontainers, ArchUnit, k6 (planned), GitHub Actions (planned)

## Run locally

You need Java 21, Docker and Maven (the wrapper is included).

```bash
cp .env.example .env     # then set the passwords and JWT_SECRET
docker compose up -d     # Postgres on 5433, Redis on 6379

set -a && . ./.env && set +a
cd backend && SPRING_PROFILES_ACTIVE=dev ./mvnw spring-boot:run
```

The `dev` profile creates demo data on first start: an organizer (`organizer@ticketrush.dev`, password from `DEMO_ORGANIZER_PASSWORD`), four venues and five published events. Leave the profile off for an empty database.

- API docs: http://localhost:8080/swagger-ui/index.html
- Try it: `curl "localhost:8080/api/events?city=montreal"`

Postgres uses port 5433 so it does not clash with one already running on 5432.

## Tests

```bash
cd backend && ./mvnw verify
```

Integration tests start real Postgres and Redis containers with Testcontainers, so Docker must be running.

## What exists so far

| Area | Detail |
|---|---|
| Sign-up and sign-in | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/me`. BCrypt passwords, 30 minute HS256 tokens. The app refuses to start without a 32+ character `JWT_SECRET` |
| Duplicate emails | Unique on lowercase email in the database. A test fires 8 simultaneous sign-ups for one email and expects exactly one to win |
| Venues | Organizers create a venue from sections x rows x seats and every seat is generated (rows A to Z, then AA). Capped at 5,000 seats |
| Events | Organizers create a draft with prices and a drop time, then publish. Publishing creates one inventory row per seat. It locks the event row, so 6 simultaneous publishes still create each seat exactly once |
| Prices | Whole cents. Guests see the all-in price: face plus a 7.5% fee, rounded half up, computed in one tested place. A $96.00 seat shows as $103.20 |
| Browsing | `GET /api/events` (filter by city and text, paged), `GET /api/events/{id}` (tiers, availability, sale state, server time), `GET /api/events/{id}/seats` (rows and seats with status). No sign-in needed |
| Sale state | `UPCOMING`, `QUEUE_OPEN`, `ON_SALE`, `ENDED`, derived from the clock and never stored. Responses include server time so a countdown cannot drift |
| Caching | The seat map is cached for 2 seconds in-process. Public GETs send `Cache-Control: max-age=5` and an ETag that answers 304 |
| Seat holds | `POST /api/events/{id}/holds` holds 1 to 6 seats for 10 minutes, all or nothing, with an itemised price (face, fees, total). `GET .../holds/me` shows your hold and `DELETE /api/holds/{id}` releases it. A new hold replaces your old one, and a failed one leaves the old one alone |
| No double holds | One conditional `SKIP LOCKED` claim in Postgres, see [the decision record](docs/adr/0001-seat-claims.md). Tests release 300 guests at one seat (exactly one wins) and 500 guests at overlapping pairs from 40 seats, then check the database: no seat in two holds, every hold holds what it says |
| Expiry | An expired hold frees its seats at once, with or without the background sweeper. Tested by moving the clock |
| Waiting room | Events can have a waiting room. Guests join with `POST /api/events/{id}/queue`, get an exact place (`GET .../queue`, or live over SSE at `.../queue/stream`), and are let in first come, first served at a steady rate with a cap on how many are inside. Refreshing or reconnecting keeps your place. See [the decision record](docs/adr/0002-waiting-room.md) |
| Admission | Admitted guests get a signed token. On a waiting-room event the hold endpoint refuses anyone without a valid one for that guest and that event, without touching Redis. Tests cover another guest's token, another event's, expired, tampered and a sign-in token |
| Queue under load | 200 guests joining at once get places 1 to 200 with no gaps or repeats. 8 admission rounds at the same instant admit exactly the cap and exactly the first guests in line. Several app instances share one round per second |
| Checkout | `POST /api/orders` with an `Idempotency-Key` header and `{holdId, paymentToken}` turns a hold into an order: 201 paid, 202 outcome unknown, 402 declined, 409 seats lost and refunded. Card details never reach the server, only a provider token. See [the decision record](docs/adr/0003-checkout-and-payments.md) |
| No double charge | Three layers: the idempotency key, one live order per hold, and an order-derived key at the provider. Tests send 10 identical requests at once (one order, one charge), 10 different keys for one hold (exactly one pays) and 5 guests paying for different holds together, then check the database |
| Unknown outcomes | A timeout is not a failure. The order stays pending with the seats held, a retry settles it without a second charge, and a reconciler looks up stuck charges at the provider. If the seats were lost while the charge ran, the guest is refunded and a failed refund is retried |
| Confirmations | Paying writes an outbox row in the same transaction. A relay delivers it to idempotent listeners: one confirmation message per order, and the guest's place in the waiting room is freed. A failing delivery is counted and retried, never lost |
| Tickets | `GET /api/tickets`, a QR code per ticket as SVG at `/api/tickets/{id}/qr.svg`, and organizer scanning at `POST /api/tickets/scan`. 20 scanners presenting one ticket at once admit it exactly once |
| Roles | Browsing is public. Creating venues and events is organizer only, and an organizer can only change their own events |
| Errors | RFC 7807 problem responses, with each invalid field listed |
| Architecture | ArchUnit tests enforce `api -> application -> domain` layering and no cycles between modules |
| Schema | Flyway migrations only. Hibernate runs in `validate` mode |
