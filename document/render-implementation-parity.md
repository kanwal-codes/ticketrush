# Screen implementation notes

What each production screen does today, and where it still differs from the design explorations. The explorations (the clickable journey, the screen gallery and the concept directions) live under `frontend/src/features/design/` and load only in development, at `/design-lab`; they are reference material and are not part of the build. The rules the screens follow are in `ticketrush-design-system.md`.

| Screen | Route | What it does |
| --- | --- | --- |
| Discovery | `/` | A lead event, then everything on sale: category tabs, city and date filters, price, date and name sorting, all kept in the address. Search sits in the header; scrolling past the page's own filters turns the header into a compact filter bar, and scrolling up brings the brand and search back. Four-column event grid, two on a phone. |
| Event | `/events/:id` | Large poster beside the title, description, facts and one booking card (status, starting price, countdown when the sale is not open, the action). On a phone the booking card comes before the facts. The tiers and what is left follow. |
| Queue | `/events/:id/queue` | Poster beside live queue state: people ahead, estimated wait, place, progress, connection status, leaving. |
| Seats | `/events/:id/seats` | Seat map with a stage, sections, 44 px seat controls and a key. A running summary beside it; on a phone a bar along the bottom that names the chosen seats, shows the total and holds or releases them. |
| Checkout | `/events/:id/checkout` | Order summary (whole poster as a thumbnail, seats, totals, the live hold clock) and the payment form. The summary comes first on a phone and never overlaps the form. |
| Confirmation | `/tickets` after paying | Confirmation in the purchased event's tint, then the tickets. |
| Tickets | `/tickets` | One ticket per seat: poster, event and seat, private QR with a fallback, a tear-off stub with notches. |
| Sign in, register, recovery | `/signin`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email` | One narrow card shared by all of them, with validation and the links between them. |
| Account | `/account` | Identity card, real issued-ticket count, email status, data export, and account closure set apart in the danger colour. |
| Organizer | `/console`, `/console/events/:id` | Dark sidebar (a strip on a phone), event cards, real metrics, per-section sales meters. |
| Create event | `/console/events/new` | Sectioned form cards and a live poster preview. |
| Scanner | `/console/events/:id/scan` | Dark input surface, real code checking, outcome panel, recent scans. |
| States | everywhere | Loading, empty, error and payment-pending states share the same controls, surfaces and type. |

## Where it differs from the explorations, or is unfinished

- Category labels are inferred from words in an event's name and artist, because the API has no category field. Search and filtering download every page of events in the browser first; that should move to server-side queries for a large catalog.
- Events supply a generated vector poster and a three-colour palette, not uploaded artwork. Photo posters would need an upload feature and storage.
- The explorations' hourly sales chart used invented numbers. The live dashboard shows real per-section sales; an hourly series remains to be built.
- There is no receipt download and no separate order history.
- The scanner supports typed codes and keyboard-style scanners. A camera viewport and a separate admit step are not built: a valid scan admits the ticket immediately.
- The explorations' queue estimates, email-delivery claims and account statistics were examples. Production shows the values the API provides.

## Verification

Run on 21 October 2026 against the local stack (`dev,loadtest` profiles, 60-second holds):

- Typecheck and production build pass; the build contains no design-gallery code or art.
- 358 unit tests pass. The Playwright suite passes on the desktop and phone (Pixel 7) projects: 37 passed, 2 skipped.
- Every public screen and the buyer flow (event, seats, hold, checkout, payment, tickets, account) were driven in a browser at 1440 px and 390 px; no horizontal overflow, one top-level heading per page, and no tap target under 40 px was measured on the guest routes.
- The organizer event list and dashboard were viewed at 1440 px, and the event form and scanner at 390 px; the other combinations were not.
- Not exercised: live payment against a real provider, camera scanning, the waiting room while actually queued (admissions are too fast locally to catch), and Safari and Firefox. Scrolling smoothness was checked by measuring layout shift and animation state, not frame times.
