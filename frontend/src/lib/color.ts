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
