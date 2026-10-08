# 0007. The organizer console and the live deployment

Status: accepted. Date: 2026-10-09.

## Context
The backend could create venues and events, publish and cancel them, and scan tickets, but only through raw API
calls. An organizer had no way to see their own events, sales or door count in a browser, and nothing was deployed: no
host configuration, a production database would have been empty with no way to make the first organizer, and the
Dockerfiles were never built by CI.

## Decision
**The console**
- Organizer reads live under `/api/organizer/**` with the organizer role. Everything under `GET /api/events/**` is public,
  so an organizer read placed there would have been open to the world; a separate prefix cannot be shadowed by it.
- Venues have an owner, so a list of "my venues" is possible; events were already owned. Every read checks the event is the
  caller's (403 otherwise), tested for each route, for guests and for another organizer.
- One place defines the numbers. Sold, held (live holds only, so an expired hold is available again whether or not the
  sweeper has run) and revenue come from one set of queries, and the tests compare them with direct SQL after holds,
  purchases and expiry, not with each other.
- Every scan attempt is recorded, accepted or not, after the ticket itself has been dealt with, in the same
  transaction. A log write can therefore never change the outcome, and twenty scanners with one ticket still admit it once
  and leave twenty rows.
- The queue length for an event lives in the queue module (`/api/organizer/events/{id}/queue`), because the catalog may
  not depend on it.
- The page guard (`RequireOrganizer`) only decides what to show. The server is the protection.
- The create form checks the server's own date and seat rules, in its words, before asking; it keeps its draft in
  session storage so the 30 minute token running out mid-form does not lose it; and if the venue was created but the
  event was refused, a retry reuses the venue instead of making a second.
- Publishing and cancelling ask first, and cancel says in plain words that tickets already sold are not refunded.
- The door scanner is a text box that is always focused, which is how keyboard-style scanners work, with a large answer
  and no camera: nothing to get permission for, and it works on any phone.

**Production**
- Sign-in and sign-up are rate limited per client address (Redis, one INCR per request, fail open if Redis is down).
  nginx passes Fly's own `Fly-Client-IP` as the only forwarded address, so a client cannot dodge the limit by sending its
  own `X-Forwarded-For`.
- The first organizer comes from configuration in any profile and never changes an account that exists. The demo seeder runs
  under `dev` or `demo` and no longer depends on the organizer not existing, so the two cannot interfere.
- A `prod` profile turns the API docs off, trusts forwarded headers and reads one `REDIS_URL`.
- Fly.io, two apps: nginx is public and forwards `/api` over the private network to the API, which has no public address.
  That keeps Swagger, Actuator and `/dev` off the internet by construction, and keeps the same-origin shape the web app was
  built for (no CORS, strict security policy). Vercel was considered for the static site; it was not chosen because the
  backend still needs a long-running host, and putting the web app elsewhere would mean proving that the live waiting room
  stream survives a rewrite proxy.
- Deploys are started by hand (a workflow with a required confirmation environment), never by a merge. CI now builds both
  images, and `scripts/smoke-live.sh` proves what must be closed is closed.

## What looking at it found
- The web image had not built since the screenshot script was added: its typecheck needed files the image leaves out. CI
  never built images, so nothing noticed. The image now only bundles (CI typechecks), and a CI job builds both images.
- A poster title of wide capitals ("ORCHESTRA") ran past the poster's edge: the fitting used an average letter width.
  Lines within 12% of the width are now pinned to it.
- The scanner's box was not focused when the page had to load first, found by a test that checks the cursor is in it.
- Two things were environment, not product: a dev server that had been up for hours stopped forwarding `/api` and showed
  "No connection" on every console page (the error screen did its job), and test runs fill the demo organizer's event list.

## Consequences
- The events list is not paginated; an organizer with hundreds of events gets hundreds of cards.
- A published event cannot be edited; cancel does not refund (it says so).
- The sign-in expires after 30 minutes mid-session (the draft survives it).
- Not done: a camera scanner, pagination, editing, organizer sign-up, bot protection on the queue, real payments, and a run of
  the load test against the live deployment (ADR 0004's numbers stay labelled as one laptop).
- The deployment is prepared and verified locally (images build, nginx config valid with both resolvers, the smoke test passes against
  the local containers); it is live only once the owner creates the Fly apps, sets the secrets and starts the deploy
  ([deploy.md](../deploy.md)).
