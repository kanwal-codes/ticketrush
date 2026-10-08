/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Motion must stay cheap. Animating width, height, margin, top and the like makes the browser lay the page out again
 * on every frame, which is what makes pages stutter. Only transform and opacity (the compositor's own properties) and a
 * few paint-only properties may move. This reads every stylesheet and fails the moment someone breaks that.
 */
// Read from disk: the test runner is set to ignore CSS imports, which would hand this test empty files.
const root = join(import.meta.dirname, '..')
const files: Record<string, string> = Object.fromEntries(
  (readdirSync(root, { recursive: true }) as string[]).filter((f) => f.endsWith('.css')).map((f) => [f, readFileSync(join(root, f), 'utf8')]),
)

const ALLOWED = new Set([
  'transform', 'opacity', 'translate', 'scale', 'rotate',
  // Paint only, no layout:
  'color', 'background-color', 'border-color', 'outline-color', 'outline-offset', 'box-shadow', 'fill', 'stroke', 'stroke-dashoffset', 'visibility',
])

function blocks(css: string, start: RegExp): string[] {
  const found: string[] = []
  for (const match of css.matchAll(start)) {
    let depth = 1
    let i = (match.index ?? 0) + match[0].length
    const from = i
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++
      if (css[i] === '}') depth--
      i++
    }
    found.push(css.slice(from, i - 1))
  }
  return found
}

function keyframeProperties(css: string): string[] {
  return blocks(css, /@keyframes\s+[\w-]+\s*\{/g).flatMap((body) =>
    [...body.matchAll(/([a-z-]+)\s*:\s*[^;{}]+;/g)].map((m) => m[1]!).filter((p) => !p.startsWith('animation')),
  )
}

function transitionProperties(css: string): string[] {
  const out: string[] = []
  for (const m of css.matchAll(/(?<![\w-])transition(-property)?\s*:\s*([^;]+);/g)) {
    const value = m[2]!.replace(/\([^)]*\)/g, '()').trim()
    if (value === 'none') continue
    for (const part of value.split(',')) out.push(m[1] ? part.trim() : part.trim().split(/\s+/)[0]!)
  }
  return out
}

describe('motion stays cheap', () => {
  const sheets = Object.entries(files)

  it('finds the stylesheets', () => {
    expect(sheets.length).toBeGreaterThan(8)
    expect(sheets.some(([name]) => name.endsWith('motion.css'))).toBe(true)
  })

  it('only animates transform, opacity and paint-only properties in keyframes', () => {
    const offenders = sheets.flatMap(([name, css]) => keyframeProperties(css).filter((p) => !ALLOWED.has(p)).map((p) => `${name}: @keyframes animates ${p}`))
    expect(offenders).toEqual([])
  })

  it('only transitions transform, opacity and paint-only properties', () => {
    const offenders = sheets.flatMap(([name, css]) => transitionProperties(css).filter((p) => !ALLOWED.has(p)).map((p) => `${name}: transition on ${p}`))
    expect(offenders).toEqual([])
  })

  it('has real keyframes to check (so the test cannot pass by finding nothing)', () => {
    const motion = sheets.find(([name]) => name.endsWith('motion.css'))![1]
    expect(keyframeProperties(motion)).toEqual(expect.arrayContaining(['transform', 'opacity']))
  })

  it('catches a layout property if one is ever added', () => {
    expect(keyframeProperties('@keyframes bad { from { width: 0; } to { width: 100%; } }').filter((p) => !ALLOWED.has(p))).toEqual(['width', 'width'])
    expect(transitionProperties('a { transition: height 1s ease, opacity 1s; }').filter((p) => !ALLOWED.has(p))).toEqual(['height'])
    expect(transitionProperties('a { transition: all 1s; }').filter((p) => !ALLOWED.has(p))).toEqual(['all'])
  })
})
