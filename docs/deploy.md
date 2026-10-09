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
forwarded headers and reads `REDIS_URL`; `demo` creates the demo organizer (`organizer@ticketrush.dev`), eight venues
and thirteen published events on an empty database (a database that already has the first five gets the other eight once). **Payments are the mock provider's**, so this is a demo, not a shop.
For a real organizer without demo data, leave `demo` out of `SPRING_PROFILES_ACTIVE` and set
`TICKETRUSH_BOOTSTRAP_ORGANIZER_EMAIL` and `TICKETRUSH_BOOTSTRAP_ORGANIZER_PASSWORD` (12+ characters) instead.

## 4. Deploy

```bash
cd backend  && fly deploy --no-public-ips --ha=false   # the API first; wait for its health check
cd ../frontend && fly deploy --ha=false                 # then the web app
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

## What the live demo runs on

The demo at https://ticketrush-web.fly.dev was set up with these choices, for the lowest steady cost that never goes to sleep:

- **Postgres: Supabase** (a project of its own, `ticketrush`, in `ca-central-1`). The app logs in as a dedicated `ticketrush`
  role (created with `create role ticketrush with login password '...'`, then `grant usage, create on schema public to
  ticketrush`), through the **session pooler**: host `aws-1-ca-central-1.pooler.supabase.com`, port 5432, and the user name
  has the project reference appended (`ticketrush.<project-ref>`). `DB_POOL_SIZE=10` keeps it inside the pooler's limits.
  The whole backend suite passes on Postgres 17, which Supabase runs. **On Supabase's free plan a project with no traffic is
  paused after a week**, and a paused database means the live site shows errors until it is restored in the Supabase
  dashboard. Keep it active, or move to a paid plan.
- **Redis: Fly's Upstash**, pay as you go ($0.20 per 100,000 commands; the waiting room's admission timer alone is a few
  dollars a month). `fly redis update` can move it to a fixed-price plan.
- **One machine per app.** Fly starts two by default for availability; `--ha=false` (and `fly scale count 1`) keeps one,
  which is the shape the load numbers were measured on.

## Turning on the sign-up bot check (Cloudflare Turnstile)

Sign-up can ask Cloudflare to confirm the person is not a script. It is off until you do these steps, and nothing else
changes while it is off.

1. In the Cloudflare dashboard, Turnstile, add a site for the hostname `ticketrush-web.fly.dev` (widget mode Managed).
   You get a **site key** (public) and a **secret key** (private).
2. Put the secret on the API: `fly secrets set -a ticketrush-api TURNSTILE_SECRET='...'`. This restarts the API.
3. Put the site key in `frontend/fly.toml` under `[build.args]` (`VITE_TURNSTILE_SITE_KEY`), merge, and redeploy the web
   app: `cd frontend && fly deploy --ha=false`. It is built into the page, so it cannot be changed without a redeploy.
4. Run `scripts/smoke-live.sh`: it now expects a sign-up without the check's answer to be refused.

Only sign-up is checked (bots need accounts to join a queue); signing in is protected by the per-address limit. If
Cloudflare cannot be reached, sign-up is refused with a message to try again, and people who already have accounts are
not affected. To turn it off: `fly secrets unset -a ticketrush-api TURNSTILE_SECRET`.

## Turning on email (Resend)

Email carries the links for a forgotten password and for confirming an address, plus order confirmations and cancellation
notices. Without a key the app only logs messages and nobody is asked to confirm an address, so nothing else changes.

1. Create a Resend account and **add and verify a domain you own** (DNS records, a few minutes). Without a verified
   domain Resend only delivers to your own address, which is enough to try it but not to open sign-up to the public.
2. Create an API key (sending access) and set it, with the sender, on the API: `fly secrets set -a ticketrush-api
   RESEND_API_KEY='re_...' MAIL_FROM='TicketRush <tickets@your-domain>'`. This restarts the API.
3. Check: sign up with a real address, open the link in the email, then try "Forgot your password?".

From then on new guests must confirm their address before they can join a queue, hold seats or pay (the page tells them,
with a button to send the link again); accounts that already exist count as confirmed. `PUBLIC_URL` in
`backend/fly.toml` is where the links point. To turn email off again: `fly secrets unset -a ticketrush-api RESEND_API_KEY`.

## Watching the live site

`.github/workflows/uptime.yml` checks `/healthz`, the home page and `/api/events` (which reads the database) every two
hours and by hand. A failing run emails the repository owner. Those requests are also what should keep the free
Supabase project from looking idle, but Supabase does not spell out what counts as activity, so check
(`list_projects` in the Supabase MCP, or the dashboard) that the project is still **Active** a week after the first
run; if it paused anyway, restore it in the dashboard and move the project to a paid plan.

## Day to day

| To | Run |
|---|---|
| See logs | `fly logs -a ticketrush-api` |
| Check what is running | `fly status -a ticketrush-api` and `fly status -a ticketrush-web` |
| Roll back | `fly releases -a ticketrush-api`, then `fly deploy --image <the previous image>` |
| Sign everyone out (rotate the token key) | `fly secrets set -a ticketrush-api JWT_SECRET="$(openssl rand -base64 48)"` |
| Change the waiting room pace | `fly secrets set -a ticketrush-api TICKETRUSH_QUEUE_ADMIT_PER_SECOND=20` |

## Things to know

- **One API machine.** The app supports several (the waiting room shares one admission round per second through
  Redis), but the measured numbers in [performance.md](performance.md) are for one machine of this size.
- **Cost.** Two small always-on machines plus the two managed services. Look at fly.io/pricing for today's prices
  before creating them; the `min_machines_running` lines in the two `fly.toml` files are what keep them on.
- **The 30 minute sign-in.** A token lasts 30 minutes, but the app renews it (`POST /api/auth/refresh`) whenever someone is
  using it and it has under ten minutes left, for up to eight hours after the password was entered
  (`TICKETRUSH_JWT_MAX_SESSION`). After that, or after a long idle, the person signs in again; the create-event form keeps
  its draft across that.
- **Not proven before the first deploy:** Fly's private DNS name resolving from nginx, and managed Redis over TLS. The
  smoke test and `fly logs` will show either problem at once, and a rollback is one command.
