import type { CSSProperties } from 'react'
import type { PosterView } from '../api/types'
import { contrast, onColor } from './color'

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
  return {
    '--ev': poster.inkOne,
    '--ev-accent': poster.inkTwo,
    '--ev-paper': poster.paperColor,
    '--on-ev': onColor(poster.inkOne),
    '--on-ev-paper': onColor(poster.paperColor),
    '--ev-text': textInk(poster),
  } as CSSProperties
}
