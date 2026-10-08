# 0006. Motion and errors

Status: accepted. Date: 2026-10-09.

## Context
The first version of the web app worked and passed its accessibility scans, but it was static: pages swapped
instantly, seats only changed colour, numbers jumped. Errors were plain paragraphs in eight places with no shared
look, wording or next step. A flash sale is stressful; the interface should feel calm and say what is true.

## Decision
**Motion**
- Purposeful and short: 120, 200, 320 and 500 ms, one easing family. Only `transform` and `opacity` animate, plus
  paint-only properties (colour, border, shadow). A test reads every stylesheet and fails on anything else, so a
  layout-animating rule cannot slip in.
- The View Transitions API for page changes and the poster that glides from a card to its event page (one
  `view-transition-name` per event), with a plain CSS rise-in where it is missing. No animation library.
- Skeletons are shaped like the page they stand in for, and a test measures cumulative layout shift (< 0.02).
- Focus moves to the new page's heading on navigation, and scroll is restored.
- `prefers-reduced-motion` removes movement and stops everything that loops. A test checks it in a real browser.

**Errors**
- Wording lives in one function, `describeError`, with four rules: say what happened; say whether the guest's place,
  seats or money are affected, only when true; say the next step; never blame the guest. Payment outcomes keep their
  own wording because the exact state of the money is the point.
- Presentations by kind: field errors under the field; `Notice` for what just failed where the guest acted (error and
  warning are announced at once, information politely); a live countdown from `Retry-After` for rate limits;
  a connection bar that says the place in line is kept and announces the return; a full-page `ErrorScreen`
  (code, headline, one primary action, collapsible details with a support reference) for pages that cannot render;
  toasts only for passing news; an `ErrorBoundary` as the last line of defence, using plain links in case the router
  is what broke.
- Errors render inside the layout, so the header and hold timer stay visible while a page is in trouble.

## What looking at it found
Unit tests passed while real screenshots showed: a 404 screen with no header (route errors replaced the whole
layout), an offline bar covering the page heading, a one-pixel sideways scroll while ticket stubs tilted in on a
phone, and a hero that vanished once the database held more events than one page (the screenshot script now
creates its featured event with an early date).

## Consequences
- Every new screen gets motion and error behaviour from shared parts instead of inventing its own.
- Some motion is invisible to tests (how it feels); screenshots and a manual walk remain part of review.
- Not done: sound, haptics, dark mode, an animation library, and a flash when someone else takes a seat the guest
  is looking at (the map already updates and tells the guest).
