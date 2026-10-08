import type { CSSProperties } from 'react'
import './skeletons.css'

/**
 * What each page looks like before its data arrives: the same shapes in the same places, so when the content
 * comes in nothing jumps. Each is a polite "loading" for screen readers and is replaced, not toggled.
 */
function Bar({ width = '100%', height = 16 }: { width?: string; height?: number }) {
  return <div className="skeleton" style={{ width, height } as CSSProperties} />
}

function Frame({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`page sk ${className}`} aria-busy="true" aria-label={label}>
      <span className="visually-hidden" role="status">
        {label}
      </span>
      {children}
    </div>
  )
}

export function HeroSkeleton() {
  return (
    <div className="sk-hero" aria-hidden="true">
      <div className="skeleton sk-poster" />
      <div className="sk-stack">
        <Bar width="40%" height={12} />
        <Bar width="85%" height={64} />
        <Bar width="30%" height={20} />
        <Bar width="55%" height={44} />
        <Bar width="180px" height={48} />
      </div>
    </div>
  )
}

export function EventSkeleton() {
  return (
    <Frame label="Loading event">
      <div className="sk-split">
        <div className="skeleton sk-poster" />
        <div className="sk-stack">
          <Bar width="75%" height={64} />
          <Bar height={72} />
          <Bar height={150} />
          <Bar height={64} />
          <Bar height={64} />
        </div>
      </div>
    </Frame>
  )
}

export function QueueSkeleton() {
  return (
    <Frame label="Loading the waiting room" className="sk-narrow">
      <Bar width="30%" height={12} />
      <Bar width="85%" height={56} />
      <Bar width="45%" height={112} />
      <Bar height={10} />
      <Bar height={72} />
    </Frame>
  )
}

export function SeatsSkeleton() {
  return (
    <Frame label="Loading seats">
      <Bar width="55%" height={64} />
      <div className="sk-split sk-split--panel">
        <div className="sk-stack">
          <Bar height={28} />
          {[0, 1, 2].map((row) => (
            <div key={row} className="sk-seats">
              {Array.from({ length: 14 }, (_, seat) => (
                <div key={seat} className="skeleton sk-seat" />
              ))}
            </div>
          ))}
          <Bar height={28} />
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="sk-seats">
              {Array.from({ length: 14 }, (_, seat) => (
                <div key={seat} className="skeleton sk-seat" />
              ))}
            </div>
          ))}
        </div>
        <div className="skeleton sk-panel" />
      </div>
    </Frame>
  )
}

export function CheckoutSkeleton() {
  return (
    <Frame label="Loading checkout">
      <Bar width="35%" height={56} />
      <div className="sk-split sk-split--panel">
        <div className="sk-stack">
          <Bar width="50%" height={32} />
          <Bar height={48} />
          <Bar height={48} />
          <Bar height={54} />
        </div>
        <div className="skeleton sk-panel" />
      </div>
    </Frame>
  )
}

export function WalletSkeleton() {
  return (
    <Frame label="Loading your tickets">
      <Bar width="30%" height={56} />
      <div className="sk-stack sk-tickets">
        <div className="skeleton sk-ticket" />
        <div className="skeleton sk-ticket" />
      </div>
    </Frame>
  )
}
