# Screen content and hierarchy audit

Reviewed 20 October 2026. This is an audit, not an implementation change.

## Evidence and limits

- Read the production route map, shared layout, and guest, account, authentication, organizer, recovery and error-screen implementations.
- Loaded full public pages against the running local app: home, event 10, sign in, registration, forgotten password, reset password, email verification, terms, privacy, refunds, contact, 404 and goodbye. Checked the principal public screens at 390px as well as desktop.
- Rendered seats, checkout, queue, tickets (empty and populated with QR failure), account, organizer events (empty), event creation, published dashboard and door entry at 1414px and 390px using intercepted local test fixtures. These establish layout/content evidence, not production API correctness. No real accounts, queue positions, holds, purchases, scans or cancellations were created.
- Draft editing, successful payment confirmation, successful recovery/verification, published organizer lists, and all alternative error/sale states were source-reviewed; not every variant was rendered. Successful QR rendering and camera use were not tested. The scanner currently has no camera workflow.
- Full-page screenshots were captured under `/tmp/audit-*`. No document-width overflow was detected in the mobile routes measured. That is not a complete accessibility or device certification.
- The interface checklist informed checks for labels, navigation, focus and recovery. This report prioritizes screen purpose and accurate content over cosmetic checklist rules.

## The central decision

Each screen needs one primary job. Discovery helps choose an event; event details establish whether to attend; queue communicates waiting status; seats support an informed selection; checkout confirms and pays; tickets enable entry; account manages identity/security; organizer screens run an event. The current shared header and repeated decorative content blur these jobs.

Keep the approved visual direction: monochrome discovery, restrained poster-derived event accents, readable light surfaces, calm motion. Do not replace this with more slogans, badges, reassurance paragraphs or invented statistics.

## Fix first: correctness and misleading states

1. **Venue time is not explicit.** `frontend/src/lib/time.ts:38` uses browser-local date/time formatting without a venue timezone. `frontend/src/features/console/EventForm.tsx:237` accepts local datetimes without saying which timezone they represent. Event details, tickets and checkout need an explicit venue timezone; the form needs a matching timezone model. An unlabeled time should not change meaning when a guest travels. The displayed 5 a.m. public event time was observed, but the intended seed-data time was not established.
2. **Publication is mislabeled as availability.** `frontend/src/features/console/ConsoleEvents.tsx:12` and `frontend/src/features/console/Dashboard.tsx:121` map every PUBLISHED event to “On sale.” Published, scheduled, on sale, sold out and ended are different states. Use “Published” unless real sale-state information is available.
3. **A goodbye URL falsely confirms deletion.** `frontend/src/features/account/AccountPage.tsx:120` checks closure state only for clearing the session, while line 128 always says the account is closed. Direct navigation must show a neutral state or redirect, never assert a deletion that did not occur.
4. **Ticket-detail failures become endless loading.** `frontend/src/features/tickets/TicketsPage.tsx:64` reads event data but does not handle an individual event-query error; the fallback near line 91 is always a skeleton. A ticket must retain an actionable error/retry path instead of disappearing behind loading indefinitely.
5. **Door history can imply an empty log when loading failed.** `frontend/src/features/console/Scanner.tsx:124` uses the same fallback for absent data and an empty array. Show loading, failed history with retry, and genuinely empty history separately. Also clear the previous admission result when the next check begins; the current result remains visible during the new request (`Scanner.tsx:60`).
6. **Leaving the queue can appear successful after failure.** `frontend/src/features/queue/useWaitingRoom.ts:131` suppresses the DELETE error, while the page navigates away. Keep a visible failure/retry path and only confirm leaving when the server accepts it.
7. **There is no private support channel in the current preview.** `frontend/src/features/legal/LegalPages.tsx:151` sends problems to public GitHub issues. This is an honest demonstration fallback, not a suitable purchase-support experience. Configure a private contact before presenting this as a real ticketing service.

## Screen-by-screen disposition

### Shared header and footer

**Keep:** brand, accessible account access, sign in/sign up for guests, active hold with a way to release it, legal links.

**Move/remove:** `frontend/src/app/Layout.tsx:54` puts event search on every non-home screen, including payment and door entry. Use a discovery header for browsing, a compact purchase header for the booking flow, and an organizer shell for operations. Do not show a guest's shopping timer as a primary tool in the door scanner. Keep access to an active hold elsewhere rather than deleting it globally. Avoid duplicating Discover and All events navigation unnecessarily.

**Missing:** a clear, readily discoverable My tickets destination for signed-in guests; contextual purchase labels. `Layout.tsx:68` calls the queue step “Seats” before selection is available. On mobile, the header occupies multiple rows before the task begins.

### Home / discovery

**Keep:** search, category selection, city/date filters, one featured event, event grid, result count, sorting, clear-filter/empty recovery and pagination.

**Remove/shorten:** the visible “DISCOVER / Find your next event.” block (`Discover.tsx:103`) repeats what the screen already communicates and pushes events down. Preserve an accessible page heading. Reduce hero height and the repeated featured-event emphasis; the featured event immediately reappears as the first grid item. That duplication is not a functional bug, but consumes scarce initial attention.

**Missing:** organizer-authored categories instead of title guessing (`browse.ts:8`), useful sale-state labels on cards (`EventCard.tsx:32`), and a custom-date option if the product intends more than this weekend/next week. Put sort near the main filtering controls, not only below the large hero. “Local events” should be a location view, not a genre. Add new categories only when real inventory supports them; do not manufacture festival sections or popularity claims.

**Recommended visible order:** header search → categories and city/date/sort → compact spotlight → results. Use “All events,” “Comedy,” “Festivals,” “Theatre & arts,” “Sports” consistently. Review whether “Music” better describes the actual mixed music inventory than “Concerts.”

### Event details

**Keep:** poster, event name, artist, description, date/start/doors, venue and city, availability, section prices and one booking action.

**Move/remove:** total venue capacity is less useful to a buyer than ticket type and actual availability. De-emphasize “480 reserved seats”; it should not compete with date/place. Keep the hold explanation with seat selection, where the reservation starts, rather than repeating it across pages.

**Missing:** venue address/directions, explicit timezone, organizer identity, and applicable admission/accessibility/age rules. Add a short refund-policy link near booking; keep the full policy on its own page. These require real organizer/venue data, not plausible-sounding frontend copy. Share is a useful secondary feature; saved events are optional, not a prerequisite for a complete booking screen.

**Source:** `frontend/src/features/event/EventPage.tsx`.

### Waiting room

**Keep:** event context, people ahead, estimated wait, connection state, automatic admission and confirmed leave action.

**Move/remove:** on mobile the poster precedes the actual waiting status. Reduce it to a contextual thumbnail. People ahead, exact position and total queue population are overlapping metrics; make people ahead and estimated wait primary. Remove the “back/front” framing if it implies a fixed track rather than progress relative to the guest's initial position. Consolidate repeated “your place is safe” statements into one contextual instruction/status.

**Missing:** visible freshness/stale-state handling when updates cannot be obtained; a clear statement that entering the queue does not guarantee a ticket. Keep that one short sentence, not a reassurance block. Do not call this screen “Seats” in the journey bar.

**Source:** `frontend/src/features/queue/WaitingRoom.tsx:145`, `:166`, `:181`.

### Seat selection

**Keep:** stage reference, section names, per-section price, state legend, keyboard navigation, total, specific continuation label and a release action for an existing hold.

**Move/remove:** event search and unrelated organizer navigation. Treat release as secondary so it does not rival the payment action.

**Missing:** on phones, a selected-seat count and expandable seat/price breakdown. `frontend/src/features/seats/seats.css:218` hides the selected lines and all non-total rows, leaving only a total. Guests must be able to verify what they selected before continuing. For larger venues, add a section jump/overview; do not imply that the current rectangular grid is an accurate architectural venue map.

### Checkout

**Keep:** event/date/place, selected seats, subtotal/fee/total, confirmation email, card form, clear Pay amount, one authoritative hold countdown, actionable payment errors, and cautious pending-payment recovery.

**Move/remove:** browsing search and Console links. Consolidate the header and summary countdown rather than showing the same deadline twice. The mobile summary should be compact/expandable; the full-height poster and summary currently put the payment form well down the page.

**Missing:** concise final-sale/refund terms beside payment and a private order-help route. Label the confirmation email explicitly; “Contact and card” suggests contact editing that is not offered. Keep test-mode disclosure and test-card help while this remains a demo—removing safety disclosure to appear premium would be misleading. Collapse technical test examples by default, as currently done.

**Source:** `frontend/src/features/checkout/CheckoutPage.tsx:253`, `:310`; `checkout.css:166`.

### Purchase confirmation

**Keep:** success result, order reference, paid total and tickets.

**Move/remove:** don't make a customer scan their complete ticket history to identify the order just purchased. The current confirmation says “Your tickets are below” but renders the entire wallet.

**Missing:** isolate/highlight the newly purchased order, a direct View tickets action and relevant delivery/support information. Do not promise an email unless delivery state is known. Receipt/download would be useful only when backed by real generated output.

**Source:** `frontend/src/features/tickets/TicketsPage.tsx:38`. Source-reviewed, successful payment not executed.

### My tickets / admission ticket

**Keep:** scannable QR plus fallback code, event/date/venue, exact seat, order reference, used/cancelled state, and cancelled-event notice.

**Move/remove:** on mobile the decorative artwork should not precede the actionable admission code by most of a screen. Event name is repeated in the group heading and again on the stub; one compact contextual heading is enough.

**Missing:** upcoming/past/cancelled grouping, upcoming-first ordering, order-level details and actual refund progress rather than assuming every cancellation is still “being returned.” QR retry/offline availability deserves a separate functional implementation, not an ornamental download button. Preserve a useful ticket when secondary event details fail.

**Source:** `frontend/src/features/tickets/TicketsPage.tsx:20`, `:73`; `TicketStub.tsx:18`.

### Account

**Keep:** identity once, ticket access, data export and account closure behind a clearly named destructive section.

**Move/remove:** repeated name/email in the heading, identity card and overview. Remove the “Your account” stat and unrelated “Find your next night” primary button. “Account settings” currently jumps directly to deletion (`AccountPage.tsx:76`); rename it or provide actual settings. De-emphasize the full deletion form until deliberately opened, retaining password confirmation and consequences.

**Missing:** profile editing and a deliberate security/password-change entry point. “Tickets ready” currently counts all ISSUED tickets, not necessarily future ones; either filter by event date or use the accurate label “Active tickets.” Distinguish a ticket-count failure from an indefinite dash.

### Sign in

**Keep:** email/password, password recovery, clear submit and registration switch; preserve the originating event.

**Move/remove:** global event search and the large marketing text panel, especially where it competes with the form. A small brand treatment is enough; “YOUR NEXT NIGHT OUT / YOUR ACCOUNT. YOUR TICKETS.” adds little task value.

**Missing:** show/hide password; contextual “Sign in to continue to [event]” when authentication interrupts booking. Do not add unnecessary identity fields.

### Registration

**Keep:** name, email, password requirements, terms/privacy consent copy, bot check when configured, and sign-in switch.

**Move/remove:** the same oversized marketing panel. Use “Create account” consistently between navigation, heading and action rather than several near-identical formulations where space is tight.

**Missing:** show/hide password and clear next-step email-confirmation guidance after registration, preserving booking context. Social login is optional, not a completeness requirement.

**Authentication source:** `frontend/src/features/auth/AuthForm.tsx`.

### Forgotten password

**Keep:** email, send action, privacy-preserving success response, expiry/delivery guidance and Back to sign in.

**Move/remove:** unrelated event search. Shorten the success paragraph into a clear result plus secondary delivery help.

**Missing:** a way to correct the email/retry after success, subject to rate limits; preserve the destination through recovery where feasible.

### Reset password

**Keep:** new password, requirements, submit, success sign-in and request-new-link recovery.

**Move/remove:** the generic invalid-link component offers “new confirmation link” alongside password reset. This is the wrong task vocabulary for this screen.

**Missing:** a reset-specific expired-link state with one primary “Send a new reset link” action and show/hide password.

### Email verification

**Keep:** working, confirmed and failed states.

**Move/remove:** irrelevant password-reset advice in a verification failure. Do not make “Browse events” the only success destination when the user was confirming to book a particular event.

**Missing:** appropriate resend/sign-in path and return-to-booking context. Do not expose or reproduce secret email tokens in support details.

**Recovery sources:** `frontend/src/features/auth/recovery.tsx:95`, `:154`, `:172`.

### Organizer event list

**Keep:** create action, status, title, date/venue, sold/capacity and revenue, empty state, pagination.

**Move/remove:** repeated Console/Your events labels and duplicate create actions in the empty state; one primary action suffices. Distinguish guest browsing from organizer navigation.

**Missing:** accurate publication versus sale status first. Search and status/date filters become useful as the inventory grows; they are not an excuse to add empty analytics widgets now.

**Source:** `frontend/src/features/console/ConsoleEvents.tsx:12`.

### Create event

**Keep:** show details, venue, ticket sections/prices, event/sale times, waiting-room option, poster preview, draft save and cancellation.

**Move/remove:** hide waiting-room opening fields when the room is disabled rather than asking users to fill irrelevant settings. Keep advanced new-venue layout separate from the basic show details. On mobile, bring the preview close to poster editing rather than leaving it after the entire long form.

**Missing:** actual category, venue address/timezone, admission/accessibility information and uploaded organizer poster support. The current style/ink/paper controls are a generated-poster editor, not the uploaded-poster workflow requested earlier. Preserve these as an optional template tool. Add clear saved/unsaved state and safe exit for edits; new-event local draft persistence already exists.

**Source:** `frontend/src/features/console/EventForm.tsx:154`, `:237`, `:250`.

### Edit draft

**Keep:** same core content and validation as creation, explicit draft-only restriction.

**Move/remove:** “Cancel it and create a new event” is potentially confusing venue-change advice when working on a draft; make the actual supported recovery clear without implying a nonexistent draft-cancellation control.

**Missing:** unsaved-change protection for edits. Existing local persistence only saves new-event drafts. Verify published/cancelled direct edit routes produce a clear read-only recovery rather than an editable form that only fails on save.

**Source:** `frontend/src/features/console/EventForm.tsx:94`, `:174`. Source-reviewed; edit route not rendered in this audit.

### Organizer dashboard

**Keep:** status, publication/edit actions for drafts, door-entry action, guest preview, revenue/sold counts, section availability and deliberate cancel confirmation.

**Move/remove:** make cancellation secondary to daily operations. Avoid labeling gross receipts including platform fees as an organizer payout. Hide irrelevant waiting-room metrics when no waiting room is enabled; that requires the corresponding event metadata.

**Missing:** update timestamp/stale/error indication when live refresh fails. `Dashboard.tsx:37` deliberately retains previous summary data but offers no freshness warning. Queue failure should not remain “Checking…” indefinitely. Order counts are not order management; a searchable order view and private support path are subsequent product work, not something this aggregate screen currently provides.

### Door entry

**Keep:** unambiguous event identity, checked-in count, ticket-code input, immediate outcome and recent history.

**Move/remove:** global search, guest hold controls, and the tall mobile organizer navigation ahead of the admission tool. Make the actual event name more prominent than a back link. Replace “Scan or type” with “Scan with a connected reader or enter a code” unless camera scanning is implemented.

**Missing:** mobile camera workflow if phone-based scanning is promised; explicit connection/history failure, pending-check state that replaces the previous result, and a safe route to resolve invalid tickets. Do not fabricate a camera permission UI around a non-camera implementation.

**Source:** `frontend/src/features/console/Scanner.tsx:60`, `:104`, `:124`.

### Terms, privacy and refunds

**Keep:** these separate policy pages; their detailed rules belong here rather than as repeated sales-page reassurance. Preserve truthful demo/test-mode limitations.

**Move/remove:** generic “Questions about this page? See Contact” is fine on policy pages, but becomes a self-link on Contact. Privacy language should describe actual enabled infrastructure rather than an aspirational architecture.

**Missing:** verify policy assertions against current deployment before a real launch. This was a UI/content audit, not a legal or provider-compliance review; no conclusion that the policies are legally sufficient is made.

### Contact

**Keep:** a private contact address and the instruction to include an order reference, never sensitive payment/password information.

**Move/remove:** the current public GitHub fallback is acceptable only as an explicitly limited demo. Remove the self-referential Contact link and irrelevant “Last updated” treatment for a basic support destination.

**Missing:** operational support channel, what details to provide and truthful response expectations. Do not invent support hours or guaranteed response times.

### 404 / unavailable / offline / permission errors

**Keep:** specific problem, one appropriate recovery action, optional support details. Collapsed technical details are appropriately secondary.

**Move/remove:** “the event may have ended” should not imply that an ended event normally disappears; use invalid/removed-link wording for a generic 404. Recovery must match the failed task rather than always send guests to discovery.

**Missing:** per-widget error distinctions as noted for wallet and scanner. Test payment unknown/declined/expired and queue reconnect states separately before calling the whole flow verified.

**Source:** `frontend/src/app/RouteError.tsx:9`; shared `frontend/src/components/ErrorScreen.tsx`.

### Account-closed confirmation

**Keep:** a neutral, concise completion message only after confirmed closure and sign-out.

**Move/remove:** unconditional “Your account is closed” on direct URL access.

**Missing:** guard/redirect when closure state is absent. This is a correctness fix, not a styling preference.

### Design lab / render gallery

These are internal review tools, not additional customer product screens. Keep them separate from live navigation and label mock capabilities clearly. A render containing a camera scanner, upload control, receipt button or sales chart does not establish a working implementation. The production audit above, not visual presence in the gallery, defines current capability.

## Content and visual rules for the next implementation pass

- Use direct task language: Browse events, Choose seats, Continue to payment, Pay [amount], My tickets, Create event, Save draft, Check ticket.
- Keep one visible page title. Use small labels only when they add context; do not stack Discover, Overview, Your account and repeated identities.
- Use one body font and a restrained display scale; reserve monospace for codes, timers and genuinely tabular values. A font replacement is not the first fix for the current hierarchy problems.
- Keep secondary metadata readable instead of making all supporting copy tiny uppercase labels. Use event accent for selected state, primary action and focus—not every title or paragraph.
- Order mobile content by task urgency: queue status before art, selected seats before continuation, payment summary before commitment but compact, admission code before decoration, scanner before navigation.
- Motion should preserve context and never delay access to payment or an admission code. Keep reduced-motion alternatives. This audit did not establish perceived quality of every transition.

## Implementation order

1. Accurate states, timezone model, broken recovery and private support readiness.
2. Context-specific shells; reduce mobile decoration and restore selected-seat review.
3. Organizer metadata model (category, venue/admission details, poster upload) and corresponding guest information.
4. Account/settings and ticket-wallet structure, contextual authentication/recovery.
5. Typography, spacing and motion polish after screen content and ordering are correct.

Do not add favorites, recommendations, social proof, loyalty, hourly analytics or wallet export merely to make screens look fuller. Each needs actual user value, data and a working implementation.
