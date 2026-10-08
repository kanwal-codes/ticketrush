/** Relative luminance and contrast, as WCAG defines them. */
function channel(v: number): number {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return 0
  const n = parseInt(m[1]!, 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

const DARK = '#121212'
const LIGHT = '#ffffff'

/** The best of black and white to put on top of this color. */
export function onColor(background: string): string {
  return contrast(DARK, background) >= contrast(LIGHT, background) ? DARK : LIGHT
}

/**
 * `wanted` if it is legible on `background` (3:1, the bar for large text), else black or white. Organizers choose
 * their own colors, and a poster title nobody can read helps nobody.
 */
export function readable(wanted: string, background: string): string {
  return contrast(wanted, background) >= 3 ? wanted : onColor(background)
}

function parse(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mix(from: string, to: string, t: number): string {
  const [a, b] = [parse(from), parse(to)]
  return `#${[0, 1, 2].map((i) => Math.round(a[i]! + (b[i]! - a[i]!) * t).toString(16).padStart(2, '0')).join('')}`
}

/**
 * A fill and the text to put on it that meet 4.5:1. Black or white is the best text, but a mid-tone color can fail
 * against both (a medium blue gets 4.4:1 either way). Then the fill is nudged, keeping its hue, until the text
 * passes, so a button in an organizer's color is never unreadable.
 */
export function withReadableText(fill: string, min = 4.5): { fill: string; text: string } {
  const text = onColor(fill)
  if (contrast(text, fill) >= min) return { fill, text }
  const away = text === LIGHT ? '#000000' : '#ffffff'
  for (let t = 0.04; t <= 1; t += 0.04) {
    const candidate = mix(fill, away, t)
    if (contrast(text, candidate) >= min) return { fill: candidate, text }
  }
  return { fill: away, text }
}
