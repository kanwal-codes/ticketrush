# TicketRush

Flash-sale ticketing that stays correct under a traffic spike: a waiting room, live seat maps, timed seat holds, and zero oversold seats, backed by a published load test.

> Work in progress. Phase 1 (foundation and sign-in) is done. Next: events, seat maps and seat holds.

## Stack

- **Backend:** Java 21 (virtual threads), Spring Boot 4, Spring Security with JWT, PostgreSQL 16, Redis 7, Flyway
- **Frontend:** React, TypeScript, Vite (not started)
- **Quality:** JUnit 5, Testcontainers, ArchUnit, k6 (planned), GitHub Actions (planned)

## Run locally

You need Java 21, Docker and Maven (the wrapper is included).

```bash
cp .env.example .env     # then set POSTGRES_PASSWORD, DB_PASSWORD and JWT_SECRET
docker compose up -d     # Postgres on 5433, Redis on 6379

set -a && . ./.env && set +a
cd backend && ./mvnw spring-boot:run
```

- API docs: http://localhost:8080/swagger-ui/index.html
- Health: http://localhost:8080/actuator/health

Postgres uses port 5433 so it does not clash with one already running on 5432.

## Tests

```bash
cd backend && ./mvnw verify
```

Integration tests start real Postgres and Redis containers with Testcontainers, so Docker must be running.

## What exists so far

| Area | Detail |
|---|---|
| Sign-up and sign-in | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/me` with a bearer token |
| Passwords | BCrypt, 8 to 72 characters (72 is bcrypt's limit) |
| Tokens | HS256 JWT, 30 minute lifetime. The app refuses to start without a 32+ character `JWT_SECRET` |
| Duplicate emails | Unique on lowercase email in the database. A test fires 8 simultaneous sign-ups for one email and expects exactly one to win |
| Login errors | A wrong password and an unknown email return the same response, and take similar time |
| Errors | RFC 7807 problem responses, with each invalid field listed |
| Architecture | ArchUnit tests enforce `api -> application -> domain` layering and no cycles between modules |
| Schema | Flyway migrations only. Hibernate runs in `validate` mode |
