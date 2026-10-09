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
