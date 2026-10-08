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
  const words = title.toUpperCase().trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return { lines: [], size: o.minSize }
  // How large the longest line could be set to fill the width, before any limits. Comparing these (not the
  // clamped sizes) is what shows that a long title on one line would overflow.
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
  const size = Math.min(o.maxSize, Math.max(o.minSize, best))
  return { lines, size }
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
