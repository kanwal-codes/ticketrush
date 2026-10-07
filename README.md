# TicketRush

Flash-sale ticketing that stays correct under a traffic spike: a waiting room, live seat maps, timed seat holds, and zero oversold seats, backed by a published load test.

> Work in progress.

## Stack

- **Backend:** Java 21, Spring Boot, PostgreSQL, Redis, Flyway
- **Frontend:** React, TypeScript, Vite
- **Quality:** JUnit 5, Testcontainers, ArchUnit, k6, GitHub Actions

## Run locally

```bash
cp .env.example .env   # then set POSTGRES_PASSWORD
docker compose up -d
```

Backend and frontend instructions land with their phases.
