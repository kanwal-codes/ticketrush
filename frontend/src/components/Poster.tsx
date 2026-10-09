import { useId, type ReactNode } from 'react'
import { onColor, readable } from '../lib/color'
import { fitAttrs, layoutTitle } from './posterLayout'
import './poster.css'

export type PosterStyle = 'ORBIT' | 'SUN' | 'CURTAIN' | 'AURORA' | 'PITCH' | 'VINYL'

export interface PosterProps {
  style: PosterStyle
  inkOne: string
  inkTwo: string
  paperColor: string
  title: string
  artist: string
  city: string
  startsAt: string
  /** Gives the paper grain a different pattern per event. */
  seed?: number
}

const W = 300
const H = 400
const MARGIN = 12
const MAX_WIDTH = W - 2 * MARGIN

/** Posters are drawn from the event's data, in the six styles of the design canvas. They repeat the title the page already shows, so they are hidden from screen readers. */
export function Poster(props: PosterProps) {
  const id = useId().replace(/:/g, '')
  const { style, paperColor } = props
  return (
    <svg
      className="poster"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      data-style={style}
    >
      <defs>
        <filter id={`grain${id}`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed={props.seed ?? 3} result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .9 -.28" />
        </filter>
      </defs>
      <rect width={W} height={H} fill={paperColor} />
      {DRAW[style](props, id)}
      <rect width={W} height={H} filter={`url(#grain${id})`} opacity=".35" style={{ mixBlendMode: 'multiply' }} />
    </svg>
  )
}

/* ---------- small drawing helpers ---------- */

function Halftone(p: { x: number; y: number; w: number; h: number; step: number; maxR: number; dir: 'down' | 'up' | 'right'; fill: string }) {
  const dots: ReactNode[] = []
  for (let j = 0; j * p.step < p.h; j++) {
    for (let i = 0; i * p.step < p.w; i++) {
      const t = p.dir === 'down' ? (j * p.step) / p.h : p.dir === 'up' ? 1 - (j * p.step) / p.h : (i * p.step) / p.w
      const r = p.maxR * t
      if (r < 0.5) continue
      dots.push(<circle key={`${i}-${j}`} cx={p.x + i * p.step + ((j % 2) * p.step) / 2} cy={p.y + j * p.step} r={r} fill={p.fill} />)
    }
  }
  return <>{dots}</>
}

function Wave(p: { y0: number; amp: number; fill: string; phase: number }) {
  let d = `M0 ${p.y0 + p.amp * Math.sin(p.phase)}`
  for (let x = 10; x <= 300; x += 10) d += ` L${x} ${(p.y0 + p.amp * Math.sin(x / 38 + p.phase)).toFixed(1)}`
  d += ` L300 ${p.y0 + 30} `
  for (let x = 300; x >= 0; x -= 10) d += `L${x} ${(p.y0 + 30 + p.amp * Math.sin(x / 38 + p.phase)).toFixed(1)} `
  return <path d={`${d}Z`} fill={p.fill} style={{ mixBlendMode: 'screen' }} opacity=".9" />
}

function Mono(p: { x: number; y: number; anchor?: 'start' | 'end'; fill: string; children: ReactNode }) {
  return (
    <text x={p.x} y={p.y} className="poster__mono" textAnchor={p.anchor ?? 'start'} fill={p.fill}>
      {p.children}
    </text>
  )
}

/** A long name must not run into the date beside it on the poster's top line. */
function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

function dateLabel(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`
}

type Face = 'condensed' | 'wide' | 'lightWide' | 'lightCondensed'
// Widest average glyph width of each face as a fraction of its font size, measured with the real Archivo in
// Chromium (letter-spacing included). Using the widest means a line never overflows.
const FACTOR: Record<Face, number> = { condensed: 0.46, wide: 0.86, lightWide: 0.85, lightCondensed: 0.42 }

function Lines(p: { lines: string[]; size: number; face: Face; x: number; firstBaseline: number; leading: number; fills: string[]; width?: number; anchor?: 'start' | 'middle'; halo?: string }) {
  const width = p.width ?? MAX_WIDTH
  return (
    <>
      {p.lines.map((line, i) => (
        <text
          key={i}
          x={p.x}
          y={p.firstBaseline + i * p.leading}
          className={`poster__${p.face}`}
          textAnchor={p.anchor ?? 'start'}
          fill={p.fills[Math.min(i, p.fills.length - 1)]}
          // A halo in the paper colour keeps letters readable where they cross a shape of their own colour.
          style={p.halo ? { fontSize: p.size, stroke: p.halo, strokeWidth: 5, strokeLinejoin: 'round', paintOrder: 'stroke' } : { fontSize: p.size }}
          {...fitAttrs(line, p.size, FACTOR[p.face], width)}
        >
          {line}
        </text>
      ))}
    </>
  )
}

/** A title set at the bottom of the poster, last baseline on `bottom`. */
function BottomTitle(p: { title: string; face: Face; maxLines: number; maxSize: number; minSize: number; bottom: number; leadingRatio: number; fills: string[]; x?: number; width?: number; halo?: string }) {
  const { lines, size } = layoutTitle(p.title, { maxLines: p.maxLines, width: p.width ?? MAX_WIDTH, factor: FACTOR[p.face], maxSize: p.maxSize, minSize: p.minSize })
  const leading = size * p.leadingRatio
  return <Lines lines={lines} size={size} face={p.face} x={p.x ?? MARGIN} firstBaseline={p.bottom - (lines.length - 1) * leading} leading={leading} fills={p.fills} width={p.width} halo={p.halo} />
}

/* ---------- the six styles ---------- */

type Draw = (p: PosterProps, id: string) => ReactNode

const DRAW: Record<PosterStyle, Draw> = {
  // Two overlapping discs and a halftone, title at the bottom.
  ORBIT: (p) => {
    const ink = readable(p.inkOne, p.paperColor)
    return (
      <>
        <g style={{ isolation: 'isolate' }}>
          <circle cx="182" cy="140" r="112" fill={p.inkTwo} style={{ mixBlendMode: 'multiply' }} />
          <circle cx="122" cy="196" r="100" fill={p.inkOne} style={{ mixBlendMode: 'multiply' }} />
          <Halftone x={176} y={18} w={114} h={120} step={9} maxR={3.6} dir="down" fill={p.inkOne} />
        </g>
        <BottomTitle title={p.title} face="condensed" maxLines={2} maxSize={112} minSize={44} bottom={392} leadingRatio={0.8} fills={[ink]} halo={p.paperColor} />
        <Mono x={14} y={22} fill={ink}>{clip(p.artist.toUpperCase(), 24)}</Mono>
        <Mono x={286} y={22} anchor="end" fill={ink}>{dateLabel(p.startsAt)}</Mono>
      </>
    )
  },

  // A big arc rising from the bottom, the title above it and the artist across it.
  SUN: (p) => {
    const ink = readable(p.inkOne, p.paperColor)
    const onArc = readable(p.paperColor, p.inkOne)
    const { lines, size } = layoutTitle(p.title, { maxLines: 2, width: MAX_WIDTH, factor: FACTOR.wide, maxSize: 78, minSize: 30 })
    return (
      <>
        <circle cx="224" cy="196" r="46" fill={p.inkTwo} style={{ mixBlendMode: 'multiply' }} />
        <path d="M-30 420 A190 190 0 0 1 330 420 Z" fill={p.inkOne} />
        <Lines lines={lines} size={size} face="wide" x={MARGIN} firstBaseline={20 + size} leading={size * 0.92} fills={[ink]} />
        <BottomTitle title={p.artist} face="wide" maxLines={2} maxSize={40} minSize={14} bottom={372} leadingRatio={1.02} fills={[onArc]} x={150} width={136} />
        <Mono x={14} y={20} fill={ink}>{p.city.toUpperCase()}</Mono>
        <Mono x={286} y={20} anchor="end" fill={ink}>{dateLabel(p.startsAt)}</Mono>
      </>
    )
  },

  // Stage curtains: vertical stripes with a scalloped hem, a moon, light wide type.
  CURTAIN: (p) => {
    const title = readable(p.inkOne, p.paperColor)
    const onCurtain = onColor(p.inkOne)
    const stripes = Array.from({ length: 9 }, (_, s) => (
      <g key={s} opacity={s % 2 ? 0.82 : 1}>
        <rect x={s * 33.4} y={0} width={33.4} height={236} fill={p.inkOne} />
        <circle cx={s * 33.4 + 16.7} cy={236} r={16.7} fill={p.inkOne} />
      </g>
    ))
    return (
      <>
        {stripes}
        <circle cx="150" cy="112" r="46" fill={p.inkTwo} />
        <BottomTitle title={p.title} face="lightWide" maxLines={3} maxSize={44} minSize={26} bottom={380} leadingRatio={0.95} fills={[title]} />
        <Mono x={14} y={20} fill={onCurtain}>{p.city.toUpperCase()}</Mono>
        <Mono x={286} y={20} anchor="end" fill={onCurtain}>{dateLabel(p.startsAt)}</Mono>
      </>
    )
  },

  // Light ribbons over a dark sky, a halftone horizon and light condensed type.
  AURORA: (p) => {
    const first = onColor(p.paperColor)
    const last = readable(p.inkTwo, p.paperColor)
    return (
      <>
        <g style={{ isolation: 'isolate' }}>
          {[0, 1, 2, 3, 4].map((k) => (
            <Wave key={k} y0={70 + k * 30} amp={20} phase={k * 0.9} fill={k % 2 ? p.inkOne : p.inkTwo} />
          ))}
        </g>
        <Halftone x={0} y={236} w={300} h={60} step={9} maxR={3.4} dir="up" fill={p.inkTwo} />
        <BottomTitle title={p.title} face="lightCondensed" maxLines={2} maxSize={78} minSize={36} bottom={392} leadingRatio={0.8} fills={[first, last]} />
        <Mono x={14} y={20} fill={last}>{clip(p.artist.toUpperCase(), 24)}</Mono>
        <Mono x={286} y={20} anchor="end" fill={last}>{dateLabel(p.startsAt)}</Mono>
      </>
    )
  },

  // A diagonal band and a ball, the first line of the title above and the last below.
  PITCH: (p, id) => {
    const top = readable(p.inkTwo, p.paperColor)
    const bottom = readable(p.inkOne, p.paperColor)
    const { lines, size } = layoutTitle(p.title, { maxLines: 2, width: MAX_WIDTH, factor: FACTOR.condensed, maxSize: 84, minSize: 40 })
    const [first = '', ...rest] = lines
    return (
      <>
        <polygon points="0,126 300,14 300,160 0,272" fill={p.inkOne} />
        <circle cx="214" cy="266" r="60" fill={p.inkTwo} />
        <clipPath id={`ball${id}`}>
          <circle cx="214" cy="266" r="60" />
        </clipPath>
        <g clipPath={`url(#ball${id})`}>
          <Halftone x={154} y={206} w={120} h={120} step={8} maxR={3.2} dir="right" fill={p.paperColor} />
        </g>
        <Lines lines={[first]} size={size} face="condensed" x={10} firstBaseline={86} leading={0} fills={[top]} width={280} />
        {rest.length > 0 && <Lines lines={[rest.join(' ')]} size={size} face="condensed" x={10} firstBaseline={380} leading={0} fills={[bottom]} width={280} />}
        <Mono x={14} y={20} fill={top}>{p.city.toUpperCase()}</Mono>
        <Mono x={286} y={20} anchor="end" fill={top}>{dateLabel(p.startsAt)}</Mono>
      </>
    )
  },

  // A record on a sleeve: rings, a label in the first ink, the title below.
  VINYL: (p) => {
    const ink = readable(p.inkOne, p.paperColor)
    const mono = readable(p.inkTwo, p.paperColor)
    const rings = [52, 62, 72, 82, 92, 102, 112, 122]
    return (
      <>
        <circle cx="150" cy="168" r="130" fill={p.inkTwo} />
        {rings.map((r) => (
          <circle key={r} cx="150" cy="168" r={r} fill="none" stroke={p.paperColor} strokeOpacity=".16" strokeWidth="1.2" />
        ))}
        <circle cx="150" cy="168" r="42" fill={p.inkOne} />
        <circle cx="150" cy="168" r="5" fill={p.paperColor} />
        <BottomTitle title={p.title} face="condensed" maxLines={2} maxSize={84} minSize={40} bottom={392} leadingRatio={0.8} fills={[ink]} />
        <Mono x={14} y={20} fill={mono}>{clip(p.artist.toUpperCase(), 24)}</Mono>
        <Mono x={286} y={20} anchor="end" fill={mono}>{dateLabel(p.startsAt)}</Mono>
      </>
    )
  },
}
