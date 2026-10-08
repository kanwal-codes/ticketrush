# 0008. Cancelling refunds, editing drafts, long sessions and bot checks

Status: accepted. Date: 2026-10-09.

## Context
ADRs 0005 to 0007 listed what the app did not do yet: cancelling an event refunded no one, a draft could not be edited,
the organizer's list was unpaged, a sign-in expired after 30 minutes with no way to extend it, the waiting room had no
defence against scripts, and the live site had no one watching it.

## Decision
- **Cancelling refunds.** In the transaction that cancels, every paid order with no ticket scanned yet becomes REFUNDING, its
  tickets become void and its seats are freed. The refunds are sent after that commits; one that fails stays REFUNDING
  and the reconciler retries it (the machinery already existed for lost seats, and the provider refunds once per key). An
  order whose ticket was scanned is left alone, because that guest was let in. A payment that settles after the cancel is
  refunded instead of selling seats. A cancelled event stays readable, marked cancelled and never on sale, so a buyer can
  see what was cancelled; its seat map and holds stay closed. Cancelled tickets show no code to scan.
- **Editing a draft** under exactly the create rules (one shared method, so they cannot drift apart). Only a draft: once
  published, guests have seen it and may hold seats, so it is cancelled and remade. The venue of a draft is fixed in the form.
- **Paging** the organizer's events with the same page shape the public list uses.
- **Renewing a sign-in** while it is in use, no longer than eight hours after the password was entered. The token carries when
  the password was entered; a renewal copies it, looks the account up again (a deleted account or changed role does not
  outlive its token) and is refused past the cap. The browser renews through one shared call before a request when under
  ten minutes remain, so only active people stay signed in. The cost: a stolen token can be renewed for up to eight hours.
- **A bot check at sign-up** with Cloudflare Turnstile, in its quiet mode. Bots need accounts to join a queue, so account
  creation is the gate; signing in keeps the per-address rate limit, which also keeps automation and the smoke test working.
  It is off unless a secret is configured, and it fails closed (a message to try again) when Cloudflare cannot be reached.
  The app is one page, so its security policy cannot differ per page: Cloudflare's script and frame are allowed
  site-wide, and only the sign-up page loads the script.
- **Watching the live site** with a scheduled check every two hours that fails (and so emails the owner) when the site is down,
  and whose requests read the database, which should keep the free Supabase project from looking idle.

## What looking at it found
- A cancelled event's page was a 404, so a buyer's My tickets never finished loading: found by an end-to-end test that cancelled
  an event with a paid order and then opened the buyer's tickets. The event is now readable and the page says what happened.
- The first version of "tickets of a cancelled order" returned none, because tickets were only listed for PAID orders and the
  seats were no longer held under the order. Tickets and their seats are now read from the tickets themselves.
- An older test asserted that a cancelled event was a 404; that was the old intended behaviour and was changed on purpose.

## Consequences
- Not done: refunds for guests already scanned in, a cancellation message to buyers (they see it in My tickets), editing a
  published event, and stretch features (Stripe test mode, ticket transfer, the Where Next integration).
- Turnstile needs a Cloudflare account and two keys, which only the owner can create ([deploy.md](../deploy.md)).
- Whether Supabase counts the uptime requests as activity is not documented clearly; the runbook says to check after a week.
