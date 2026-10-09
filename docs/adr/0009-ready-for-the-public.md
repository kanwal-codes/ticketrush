# 0009. What it takes to open the app to the public

Status: accepted. Date: 2026-10-09.

## Context
The app worked end to end but was a demo: no email at all (a forgotten password lost the account, nothing proved an
address belonged to the person who typed it, buyers were told nothing when an event was cancelled), payments were a
stand-in, there were no terms or privacy statement and no way to delete an account, and the only security checks were
the ones written by hand. This record covers four steps toward real use. What is still not done is at the end.

## Email and account recovery
- **A mail port with two adapters**: Resend over HTTP when `RESEND_API_KEY` is set, otherwise a stand-in that only logs
  (bodies are logged only in the dev profile, since they hold sign-in links). The app asks guests to confirm their address
  only when mail is really sent, so development, tests and CI behave as before.
- **Single-use links.** A 256-bit random secret, only its SHA-256 stored, expiring in an hour (reset) or two days
  (confirm). Using a reset link also confirms the address (it proves control of it), retires every other reset link and
  stops older sign-ins from being renewed (the token records when the password was entered; a renewal older than the
  password change is refused). A token that is already issued still works until it expires, at most 30 minutes.
- **No leaks about who has an account**: asking for a reset always answers 202, the email is sent from another thread so
  the time taken does not give it away, and at most one is sent per account per minute (so the form cannot be used to
  flood someone's inbox). The endpoints share the sign-in rate limit per address.
- **Confirming gates the queue, not browsing.** Joining a queue, holding seats and paying return 403 `EMAIL_NOT_VERIFIED`
  until the address is confirmed (a filter reads the token's `email_verified` claim; the page renews the token right after
  the link is used). Existing accounts were migrated as confirmed.
- **Order emails are an outbox.** The table that used to stand in for sending now has a send time and attempts; a relay
  sends what is not sent, each row locked and sent in its own transaction, with the row id as the provider's idempotency
  key, and a row that fails ten times is left for a person. Cancelling an event writes a cancellation notice for each
  refunded order.
- Not done: changing the email address, and mail to organizers.

## Stripe, in test mode
- **A second adapter behind the same payment port.** The port already had what a real provider needs (idempotent charge,
  look-up without charging, idempotent refund), so Stripe is one class. It is chosen when `STRIPE_SECRET_KEY` is set and
  otherwise the mock stays. A key that is not a test key stops the app from starting: live money needs a review of
  tax, disputes and Stripe's own verification, which this app has not had.
- **Card numbers never touch this server or this page's code.** Stripe's own card form (one frame) makes a PaymentMethod
  id in the browser; that id is the payment token we already accepted. The script, its frames and API are allowed by
  the security policy and loaded only on the checkout page.
- **Safe retries kept.** A charge is a PaymentIntent confirmed at once, sent with the order's key as Stripe's
  `Idempotency-Key` and written into its metadata. After an answer that was lost, the page retries with the *same*
  PaymentMethod (a new one would be a new payment), and the reconciler finds an unresolved charge through Stripe's search
  by that metadata. Refunds use one key per order.
- **No webhook.** Confirmation is synchronous and the reconciler covers the gaps, so there is no endpoint for Stripe to
  call. A webhook would shorten the time to resolve a lost answer; it is not needed for correctness.
- **3-D Secure is declined**, since completing it needs a step this app does not have. Fine for test cards, a real gap
  for live use in some regions.
- Not tested against Stripe itself in CI (that needs keys): the adapter is tested against recorded answers, and the
  browser tests use a stand-in for Stripe.js.

## Trust pages and account controls
- **Terms, privacy, refunds and contact**, written to match what the app really does (what is stored, who handles it, what a
  cancellation refunds, that tickets are final otherwise) and linked from every footer and the sign-up form. They say
  plainly that payments are in test mode, which is true and is enforced (live Stripe keys are refused). They are a
  plain-language draft and **have not been reviewed by a lawyer**; that must happen, and the pages must change, before any real money is taken.
- **A copy of your data** (`GET /api/me/export`): the account, orders with their tickets, and the messages sent, as one JSON file.
- **Closing an account** (`POST /api/me/close`, password required again, rate limited like sign-in). The user row is kept but
  loses its name, address and password, so orders and tickets keep their records and the organizer's sales still add up;
  the emails written to the guest are scrubbed and any still waiting are stopped; reset and confirmation links are
  deleted; the address can be used to sign up again. Refused for organizers (they own events), while a guest holds a
  ticket for an event that has not happened (it would be stranded), and while a payment or refund is settling.
  A token issued before closing keeps working until it expires (at most 30 minutes) but cannot be renewed.
- **The contact page** shows `VITE_SUPPORT_EMAIL` when the build has one and the project's issue tracker otherwise; a
  public service needs a real mailbox there.
- Not done: retention schedules for old order records, deleting the records after a statutory period, cookie consent
  (there are no cookies), and the legal review above.
