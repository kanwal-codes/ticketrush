# 0005. The guest web app

Status: accepted. Date: 2026-10-09.

## Context
The backend can sell tickets correctly, but a flash sale is experienced in a browser: a guest watches their place
in a queue, picks seats while other people pick the same ones, and pays over a connection that can drop. The web
app has to keep the backend's promises visible (a final price, an honest place in line, a seat never sold twice,
no double charge) and has to behave sensibly in every state the backend can produce, including the unlikely ones.

## Decision
- **React, TypeScript (strict), Vite, React Router and TanStack Query.** Plain CSS with custom properties, no UI kit:
  each event brings two inks and a paper, and theming is just three variables set on its page.
- **The types come from the backend.** `npm run api:types` generates `src/api/schema.d.ts` from the backend's OpenAPI
  document, and CI regenerates it and fails if the committed file differs. To make that useful the backend marks every
  field required unless it is explicitly nullable (a test pins this); otherwise every field arrives optional and the
  app is full of `!`.
- **One error type.** `ApiError` separates "the server said no" from "we never heard back". The difference matters
  for money: a refusal is final, a lost request may have succeeded.
- **The queue stream is read with `fetch`, not `EventSource`,** because the stream needs the Authorization header.
  The parser is about 50 lines and tested against chunks split mid-line, mid-character and mid-CRLF. If the stream
  keeps failing the page polls instead and says updates are slower. The place lives on the server, so reconnecting
  or polling cannot lose it.
- **Time is the server's.** Responses carry `serverTime`; the countdown and the hold timer use the offset, so a wrong
  laptop clock cannot show a sale as open or a hold as running.
- **Checkout is built around the Idempotency-Key.** The same attempt, retried, sends the same key; a different card or
  a final answer starts a new one; the key survives a refresh. Every response the payment endpoint can give maps to a
  screen: paid, declined (hold kept), pending (says not to pay again, asks until it knows), seats lost and refunded,
  hold expired, payment already in progress, no answer (retry is safe). The checkout keeps the hold it started with,
  so an explanation is never replaced by "no seats held" once the server stops returning the hold.
- **Card numbers never leave the page.** The form maps published test numbers to the mock provider's tokens.
- **Posters are generated** from the event's style, inks, paper and title (six styles, one more than the design
  canvas), with titles fitted using glyph widths measured from the real font. Text colours on the page are chosen for
  contrast, and fills that carry text are nudged until the text passes 4.5:1, because a mid-tone organizer colour can
  fail against both black and white.
- **The seat map is one button per seat,** with a single tab stop and arrow-key movement. Taken seats stay in the page
  (`aria-disabled`) so a screen reader can find out they are taken. Seat buttons are memoised, so choosing one seat
  does not redraw a thousand.
- **The session token is in `sessionStorage`.** It survives a refresh and is gone when the tab closes. The cost is that
  script running on the page could read it; the mitigations are a strict Content-Security-Policy in nginx and no
  third-party scripts. There is no refresh-token endpoint, so a token that runs out sends the guest to sign in and back.
- **Served by nginx in production,** which proxies `/api` with buffering off and a long read timeout so the stream
  works, sets security headers on every location, and caches hashed assets for a year but never `index.html`.

## Alternatives considered
- **`EventSource` with the token in the URL.** It would work with the built-in client, but a token in a URL ends up in
  logs, history and referrers.
- **Hand-written API types.** Less setup, and they drift from the backend silently.
- **A component library or Tailwind.** Faster to start; per-event theming and the poster system are most of the
  design, and they would have fought the library.
- **A canvas or SVG seat map.** Better for tens of thousands of seats and worse for keyboard and screen reader use.
  The venue cap is 5,000 seats, which plain buttons handle.
- **Cookies for the session.** Safer against script reading the token, but they bring CSRF, which a bearer-token API
  currently avoids entirely.

## What testing found
Unit tests and a real browser found different things, which is why both are here.
- **Unit tests with a realistic mock** found that after a refund the page swapped the explanation for "no seats held",
  because the server stops returning the hold once an order resolves.
- **A real browser** found a hold timer that was invisible (the nav link style overrode it), a seat summary that covered
  the map on a phone, a map wider than the screen, and a nav that overflowed a phone exactly when a hold was running.
- **axe** found the contrast failure on mid-tone event colours.
- **A responsive test** found a headline that could not wrap a long word, and form inputs that could not shrink.
- **The end-to-end suite against the production build behind nginx** confirmed the Content-Security-Policy, the stream
  through the proxy and the QR images shown from blobs all work together.

## Consequences
- The suite is 206 unit and component tests and 12 end-to-end tests (desktop, with the key flows repeated on a phone),
  run on every push. The end-to-end tests need the backend's `dev,loadtest` profiles to make events and guests quickly.
- The initial JavaScript is about 114 KB gzipped, with a CI budget of 150 KB.
- Confirmation "emails" are rows in a table, so the checkout says "your confirmation goes to" an address nothing is
  actually mailed to. A real mail provider is a later swap behind the same listener.
- The organizer console is not here; it is the next phase, built on the same client and tokens.
