import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Tone } from '../lib/errorCopy'
import { Icon } from './Icon'
import './toast.css'

export interface ToastInput {
  tone?: Tone
  title: string
  message?: string
  /** How long it stays, in ms. Defaults to 5 seconds. */
  duration?: number
}

interface ToastItem extends Required<Pick<ToastInput, 'title'>> {
  id: number
  tone: Tone
  message?: string
  duration: number
}

const MAX_VISIBLE = 3
const LEAVE_MS = 200

const ToastContext = createContext<(toast: ToastInput) => void>(() => undefined)

/** Short, non-blocking news: seats released, back online, copied. Anything the guest must act on is a Notice, not a toast. */
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const next = useRef(1)

  const push = useCallback((input: ToastInput) => {
    const item: ToastItem = { id: next.current++, tone: input.tone ?? 'info', title: input.title, message: input.message, duration: input.duration ?? 5000 }
    // The oldest makes way, so a burst of news never covers the page.
    setItems((current) => [...current, item].slice(-MAX_VISIBLE))
  }, [])
  const remove = useCallback((id: number) => setItems((current) => current.filter((t) => t.id !== id)), [])
  const value = useMemo(() => push, [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="region" aria-label="Notifications" aria-live="polite">
        {items.map((item) => (
          <ToastView key={item.id} item={item} onDone={() => remove(item.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastView({ item, onDone }: { item: ToastItem; onDone: () => void }) {
  const [paused, setPaused] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const remaining = useRef(item.duration)

  // The clock stops while the guest is reading (pointer or keyboard focus on it) and picks up where it left off.
  useEffect(() => {
    if (paused || leaving) return
    const started = Date.now()
    const timer = setTimeout(() => setLeaving(true), remaining.current)
    return () => {
      clearTimeout(timer)
      remaining.current -= Date.now() - started
    }
  }, [paused, leaving])

  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(onDone, LEAVE_MS)
    return () => clearTimeout(timer)
  }, [leaving, onDone])

  return (
    <div
      className={`toast toast--${item.tone}${leaving ? ' toast--leaving' : ''}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="toast__icon">
        <Icon name={item.tone} size={20} />
      </span>
      <div className="toast__body">
        <p className="toast__title">{item.title}</p>
        {item.message && <p className="toast__message">{item.message}</p>}
      </div>
      <button type="button" className="toast__close" aria-label="Dismiss" onClick={() => setLeaving(true)}>
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}
