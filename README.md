# TicketRush

Flash-sale ticketing that stays correct under a traffic spike: a waiting room, live seat maps, timed seat holds, and zero oversold seats, backed by a published load test.

> Work in progress. Done: sign-in, and the event and seat catalog. Next: seat holds, then the waiting room.

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
| Roles | Browsing is public. Creating venues and events is organizer only, and an organizer can only change their own events |
| Errors | RFC 7807 problem responses, with each invalid field listed |
| Architecture | ArchUnit tests enforce `api -> application -> domain` layering and no cycles between modules |
| Schema | Flyway migrations only. Hibernate runs in `validate` mode |
