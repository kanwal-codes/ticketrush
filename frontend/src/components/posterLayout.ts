/** Fitting a title onto a poster: where to break it into lines and how large to set it. */

export interface TitleLayout {
  lines: string[]
  size: number
}

interface Options {
  maxLines: number
  /** Space available, in poster units. */
  width: number
  /** Average glyph width as a fraction of the font size, for the face the style uses. */
  factor: number
  maxSize: number
  minSize: number
}

const longest = (lines: string[]) => Math.max(...lines.map((l) => l.length))

/** Splits words into n lines so that the longest line is as short as possible. */
function balanced(words: string[], n: number): string[] {
  let best: string[] = []
  let bestLongest = Infinity
  const walk = (start: number, remaining: number, acc: string[]) => {
    if (remaining === 1) {
      const lines = [...acc, words.slice(start).join(' ')]
      const l = longest(lines)
      if (l < bestLongest) {
        bestLongest = l
        best = lines
      }
      return
    }
    for (let cut = start + 1; cut <= words.length - remaining + 1; cut++) {
      walk(cut, remaining - 1, [...acc, words.slice(start, cut).join(' ')])
    }
  }
  walk(0, n, [])
  return best
}

export function layoutTitle(title: string, o: Options): TitleLayout {
  const all = title.toUpperCase().trim().split(/\s+/).filter(Boolean)
  if (all.length === 0) return { lines: [], size: o.minSize }
  // A title too long for its lines even at the smallest allowed size loses words from the end, with an ellipsis,
  // instead of being squeezed into something nobody can read.
  for (let count = all.length; count >= 1; count--) {
    const cut = count < all.length
    // The ellipsis takes room too, so it is part of what is measured.
    const words = cut ? [...all.slice(0, count - 1), `${all[count - 1]}…`] : all
    const { lines, best } = arrange(words, o)
    // A line may be squeezed a little below the smallest size (fitAttrs does it) before words are cut.
    if (best >= o.minSize * 0.8 || count === 1) return { lines, size: Math.min(o.maxSize, Math.max(o.minSize, best)) }
  }
  return { lines: all, size: o.minSize }
}

/** The best way to set these words, and how large the longest line could be before any limits. */
function arrange(words: string[], o: Options): { lines: string[]; best: number } {
  // Comparing these unclamped (not the clamped sizes) is what shows that a long title on one line would overflow.
  const fit = (lines: string[]) => o.width / (longest(lines) * o.factor)
  let lines = [words.join(' ')]
  let best = fit(lines)
  for (let n = 2; n <= Math.min(o.maxLines, words.length); n++) {
    const candidate = balanced(words, n)
    // A second line is worth it only if it makes the type noticeably bigger.
    if (fit(candidate) > best * 1.15) {
      lines = candidate
      best = fit(candidate)
    }
  }
  return { lines, best }
}

/**
 * The factor is an average over the alphabet, so a word of wide capitals (ORCHESTRA) runs wider than estimated.
 * A line within this much of the width is pinned to it rather than trusted to fit.
 */
const WIDE_LETTERS = 1.12

/** Set only when a line might overflow, so short lines keep their natural proportions. */
export function fitAttrs(text: string, size: number, factor: number, width: number): { textLength?: number; lengthAdjust?: 'spacingAndGlyphs' } {
  return text.length * size * factor * WIDE_LETTERS > width ? { textLength: width, lengthAdjust: 'spacingAndGlyphs' } : {}
}
