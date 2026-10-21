# TicketRush interface system

The production UI uses three families, each with one job. Bricolage Grotesque is the display face for headings and big numbers (`--font-display`). Archivo is for reading and controls (`--font-ui`). DM Mono is for short labels, seat identifiers, ticket codes, prices, and clocks (`--font-mono`). All three are self-hosted. Event posters keep their own artwork and typography. A heading never names a font family itself: `h1`–`h3` take `--font-display` from `base.css`.

## Source files

- `frontend/src/styles/tokens.css`: colors (including the one action color), type roles and families, weights, spacing, radii, and motion timings.
- `frontend/src/styles/base.css`: document typography, page width, keyboard focus, and layout foundations.
- `frontend/src/styles/components.css`: buttons and form fields, including hover, focus, disabled, and error states.
- `frontend/src/styles/motion.css`: shared transitions and animations, with reduced-motion fallbacks.
- `frontend/src/app/layout.css`: the shell: header, hold control, purchase journey bar, footer.
- One stylesheet per screen (`discover.css`, `event.css`, `seats.css`, `checkout.css`, and so on). Each is the single source for that screen, written with tokens only; there is no override layer on top of them, and no hard-coded brand colors or font names outside `tokens.css`.

## Type roles

| Token | Use | Size |
| --- | --- | --- |
| `--text-display` | Featured event and prominent event title | 40–72 px, fluid |
| `--text-page` | Main page title | 32–56 px, fluid |
| `--text-page-compact` | Authentication, recovery, legal, and error title | 28–40 px, fluid |
| `--text-section` | Section title | 22–28 px, fluid |
| `--text-item` | Card title, panel subheading, seat description | 18 px |
| `--text-body` | Reading text and input values | 16 px |
| `--text-small` | Buttons, secondary explanations, field labels | 14 px |
| `--text-caption` | Venue, date, secondary navigation | 13 px |
| `--text-label` | Short metadata and progress labels | 12 px |
| `--text-metric` | Prices, totals, dashboard metrics | 28–40 px, fluid |
| `--text-metric-compact` | Metrics in narrow dashboard columns | 20–28 px, fluid |
| `--text-count` | Queue position | 56–96 px, fluid |

Use 720 for display text, 650 for headings and emphasis, and 550 for compact labels. Keep body text regular. Headings use compact leading and modest negative tracking; paragraphs use 1.6 leading. Never reduce input text below 16 px. The wordmark is set in the display face at weight 800 with a blue period, so it matches the headlines; only the poster artwork is an exception to the interface type scale.

## Color roles

The app uses light paper, white surfaces, a soft gray inset surface, dark ink, and readable muted text. Inverse panels use the same dark surface and inverse text tokens. Error, warning, success, and informational treatments use semantic colors; status always has a written label or icon too.

There is one action color, `--action` (cobalt). Every primary button, selected seat, active step, focus ring, and link-like action uses it, on every screen, so the same kind of control never changes color from page to page. Hover uses `--action-hover`; tinted backgrounds use `--action-tint`.

Event colors belong to posters and small identity marks: the artist line on the event page, the rule across the top of the booking, seat, checkout and ticket cards, the queue number, and the confirmation tick. They do not recolor buttons, the document background, or body text. `eventTheme` computes readable foregrounds (`--ev-text`, `--on-ev`) for those marks; do not replace them with a hardcoded white or black.

## Layout and controls

Use the existing 4 px spacing scale, a 1280 px maximum page width, fluid page gutters, 6 px controls, 12 px menus and notifications, and 14 px owned tickets. Artwork stays square. Interactive targets should be at least 44 px; primary form controls are 48 px. Destructive actions use the danger button treatment.

The header holds the brand, Discover's search and filters (nowhere else has site search), the hold clock while seats are held, and the account. Purchase pages let it scroll away. Back and purchase progress remain together in one sticky row. Checkout hides the header's hold clock because the large clock beside the total is the same information. On narrow phones, hide step numbers before reducing readable labels. Seat rows scroll inside the map; the page itself must not overflow horizontally. The mobile selection summary stays fixed at the bottom and names the chosen seats beside the total, with notifications lifted above it. On checkout the order summary is never sticky: it sits beside the form on a wide screen and comes first, compact, on a phone, so it can never cover the payment form. Sticky is for something much shorter than what scrolls past it (the seat map's summary), not for two columns of similar height. Posters are shown whole, never cropped into a strip: as a thumbnail beside the event's name on checkout and tickets.

## Motion

Use 160 ms for immediate feedback, 240 ms for state changes, 280 ms for page changes, and 420 ms for longer entrances. Stagger related items by 40 ms. Animate opacity and transforms; do not animate layout. Button movement is restrained, errors do not shake, and seats do not bounce dramatically. Respect reduced motion throughout. Avoid transforms on an ancestor of fixed or sticky controls: entrance animations use `backwards` fill, never `both`, so a finished animation does not leave a page permanently transformed (that made sticky elements stutter while scrolling).

## Verification

Review production screens at desktop and phone widths, including long headings, empty and error states, hover and keyboard focus, and fixed controls. Run the existing tests and production build. A passing component test does not establish that a protected organizer page, live queue, or payment state has been visually checked.
