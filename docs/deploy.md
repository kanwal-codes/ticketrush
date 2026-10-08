# Deploying TicketRush to Fly.io

Two Fly apps, one public address. The **web** app is nginx: it serves the built site and forwards `/api` to the **API**
app over Fly's private network. The API has no public address at all, so Swagger, `/actuator` and `/dev` cannot be
reached from the internet even by mistake. Postgres and Redis are managed services.

```
browser ──https──> ticketrush-web (nginx) ──private network──> ticketrush-api (Spring, :8080, health :8081)
                                                                   ├── Postgres 16
                                                                   └── Redis 7
```

What you do yourself: create the Fly apps and the two databases, set the secrets, and start the deploy. Nothing here
deploys on its own: merging to `main` never changes the live site.

## Before you start

- `flyctl` installed and signed in (`fly auth whoami`). Images are built on Fly's builders, so Docker is not needed.
- App names are global on Fly. If `ticketrush-api` or `ticketrush-web` is taken, rename them in `backend/fly.toml` and
  `frontend/fly.toml` (the web app's `BACKEND` names the API app: `http://<api-app>.internal:8080`).
- Region: both files say `yyz` (Toronto, nearest to Montreal). Keep the apps and databases in one region.

## 1. Create the apps

```bash
fly apps create ticketrush-api
fly apps create ticketrush-web
```

## 2. Create Postgres and Redis

Any Postgres 16 and Redis 7 work. On Fly: Managed Postgres (`fly mpg create`, see `fly mpg --help` for the current
options) and Upstash Redis (`fly redis create`). Keep their connection details; the API needs:

| Secret | What it is |
|---|---|
| `DB_URL` | `jdbc:postgresql://HOST:5432/DBNAME?sslmode=require` |
| `DB_USER`, `DB_PASSWORD` | the database login |
| `REDIS_URL` | the connection string the Redis service prints (`redis://...`, or `rediss://...` for TLS) |
| `JWT_SECRET` | 32+ random characters. The API refuses to start without it |
| `DEMO_ORGANIZER_PASSWORD` | the demo organizer's password: it is the key to the console, so treat it as private |

Flyway creates the tables on the first start.

## 3. Set the secrets

```bash
fly secrets set -a ticketrush-api \
  JWT_SECRET="$(openssl rand -base64 48)" \
  DB_URL='jdbc:postgresql://...' DB_USER='...' DB_PASSWORD='...' \
  REDIS_URL='redis://...' \
  DEMO_ORGANIZER_PASSWORD='choose-a-long-one'
```

The API runs with profiles `prod,demo` (see `backend/fly.toml`): `prod` turns the API docs off, trusts the proxy's
forwarded headers and reads `REDIS_URL`; `demo` creates the demo organizer (`organizer@ticketrush.dev`), four venues
and five published events on an empty database. **Payments are the mock provider's**, so this is a demo, not a shop.
For a real organizer without demo data, leave `demo` out of `SPRING_PROFILES_ACTIVE` and set
`TICKETRUSH_BOOTSTRAP_ORGANIZER_EMAIL` and `TICKETRUSH_BOOTSTRAP_ORGANIZER_PASSWORD` (12+ characters) instead.

## 4. Deploy

```bash
cd backend  && fly deploy --no-public-ips     # the API first; wait for its health check
cd ../frontend && fly deploy                   # then the web app
```

Or from GitHub: Actions, Deploy, Run workflow (needs a `FLY_API_TOKEN` secret from `fly tokens create deploy`, and
optionally required reviewers on the `production` environment). It deploys both apps and then runs the smoke test.

## 5. Check it

```bash
scripts/smoke-live.sh https://ticketrush-web.fly.dev organizer@ticketrush.dev 'the-demo-password'
```

It checks that the site and the events API work, that the security headers are set, that Swagger, `/actuator`,
`/dev` are not served, that a guest is refused the organizer tools, that the organizer can sign in, and that guessing
passwords is rate limited. It creates one throwaway guest account. Then buy tickets on the live site once by hand.

## Day to day

| To | Run |
|---|---|
| See logs | `fly logs -a ticketrush-api` |
| Roll back | `fly releases -a ticketrush-api`, then `fly deploy --image <the previous image>` |
| Sign everyone out (rotate the token key) | `fly secrets set -a ticketrush-api JWT_SECRET="$(openssl rand -base64 48)"` |
| Change the waiting room pace | `fly secrets set -a ticketrush-api TICKETRUSH_QUEUE_ADMIT_PER_SECOND=20` |

## Things to know

- **One API machine.** The app supports several (the waiting room shares one admission round per second through
  Redis), but the measured numbers in [performance.md](performance.md) are for one machine of this size.
- **Cost.** Two small always-on machines plus the two managed services. Look at fly.io/pricing for today's prices
  before creating them; the `min_machines_running` lines in the two `fly.toml` files are what keep them on.
- **The 30 minute sign-in.** There is no refresh token, so an organizer is asked to sign in again mid-session. The
  create-event form keeps its draft across that.
- **Not proven before the first deploy:** Fly's private DNS name resolving from nginx, and managed Redis over TLS. The
  smoke test and `fly logs` will show either problem at once, and a rollback is one command.
