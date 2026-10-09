import { useEffect, useRef } from 'react'
import { turnstileSiteKey } from '../lib/turnstile'

/** The few parts of Cloudflare's widget this app uses. */
interface TurnstileApi {
  render(
    element: HTMLElement,
    options: {
      sitekey: string
      appearance: 'interaction-only'
      callback: (token: string) => void
      'expired-callback': () => void
      'error-callback': () => void
    },
  ): string
  reset(widgetId: string): void
  remove(widgetId: string): void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let loading: Promise<TurnstileApi> | null = null

function loadScript(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT
    script.async = true
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile did not start')))
    script.onerror = () => {
      loading = null // so a later attempt can try again
      reject(new Error('Turnstile could not be loaded'))
    }
    document.head.appendChild(script)
  })
  return loading
}

interface Props {
  /** The answer, or null when it has expired, failed or been used. */
  onToken: (token: string | null) => void
  /** The check could not run at all: its script did not load, or Cloudflare reported an error. */
  onError: () => void
  /** Change this to ask for a new answer (each is good for one sign-up). */
  resetKey: number
}

/**
 * Cloudflare's bot check, in its quiet mode: nothing shows unless Cloudflare wants the person to click. The script is
 * loaded here, on the sign-up page only. If it cannot load, the person is told and sign-up stays closed rather than open.
 */
export function Turnstile({ onToken, onError, resetKey }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const widget = useRef<string | null>(null)
  const callback = useRef(onToken)
  const failed = useRef(onError)
  useEffect(() => {
    callback.current = onToken
    failed.current = onError
  })

  useEffect(() => {
    let gone = false
    loadScript()
      .then((turnstile) => {
        if (gone || !box.current) return
        widget.current = turnstile.render(box.current, {
          sitekey: turnstileSiteKey(),
          appearance: 'interaction-only',
          callback: (token) => callback.current(token),
          'expired-callback': () => callback.current(null),
          'error-callback': () => {
            callback.current(null)
            failed.current()
          },
        })
      })
      .catch(() => {
        callback.current(null)
        failed.current()
      })
    return () => {
      gone = true
      if (widget.current) window.turnstile?.remove(widget.current)
      widget.current = null
    }
  }, [])

  useEffect(() => {
    if (resetKey > 0 && widget.current) window.turnstile?.reset(widget.current)
  }, [resetKey])

  return <div ref={box} className="turnstile" />
}
