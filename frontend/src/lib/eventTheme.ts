import type { CSSProperties } from 'react'
import type { PosterView } from '../api/types'
import { contrast, withReadableText } from './color'

const PAGE_PAPER = '#f6f6f3'
const INK = '#121212'

/**
 * An event's inks are chosen to look good on its poster, not to be read as text on the page. Pick whichever of the
 * two reads well on the page's paper (4.5:1, the bar for normal text), else plain ink.
 */
export function textInk(poster: PosterView): string {
  return [poster.inkOne, poster.inkTwo].find((c) => contrast(c, PAGE_PAPER) >= 4.5) ?? INK
}

/** Each event brings two inks and a paper. Setting them as variables themes everything beneath. */
export function eventTheme(poster: PosterView): CSSProperties {
  // Buttons, chosen seats and ticket stubs are filled with the event's ink and carry text, so the fill is kept
  // legible even when the organizer's exact color would not be (the poster itself keeps their exact colors).
  const ink = withReadableText(poster.inkOne)
  const paper = withReadableText(poster.paperColor)
  return {
    '--ev': ink.fill,
    '--on-ev': ink.text,
    '--ev-accent': poster.inkTwo,
    '--ev-paper': paper.fill,
    '--on-ev-paper': paper.text,
    '--ev-text': textInk(poster),
  } as CSSProperties
}
