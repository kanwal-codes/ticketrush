import { useEffect, useRef } from 'react'
import { ScrollRestoration, useLocation } from 'react-router'

/**
 * What a page change should do besides showing the new page: scroll to the top (or back to where the guest was, when
 * they press Back), and move keyboard focus to the new page's heading so a screen reader says where they are and
 * keyboard users start at the top. The heading often is not there yet (the page is still loading), so for a few
 * seconds we wait for it, unless the guest has already moved focus somewhere themselves.
 */
export function RouteEffects() {
  const { pathname } = useLocation()
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false // the very first page load keeps the browser's own focus
      return
    }
    const main = document.getElementById('main')
    if (!main) return
    main.focus({ preventScroll: true })

    const headingReady = () => main.querySelector<HTMLElement>('h1')
    const focusHeading = () => {
      const heading = headingReady()
      if (!heading) return false
      if (document.activeElement === main || document.activeElement === document.body) {
        heading.tabIndex = -1
        heading.focus({ preventScroll: true })
      }
      return true
    }
    if (focusHeading()) return

    const observer = new MutationObserver(() => focusHeading() && observer.disconnect())
    observer.observe(main, { childList: true, subtree: true })
    const giveUp = setTimeout(() => observer.disconnect(), 3000)
    return () => {
      observer.disconnect()
      clearTimeout(giveUp)
    }
  }, [pathname])

  return <ScrollRestoration />
}
