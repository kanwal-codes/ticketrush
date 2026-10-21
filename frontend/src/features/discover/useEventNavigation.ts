import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, type MouseEvent } from 'react'
import { useNavigate } from 'react-router'
import { fetchEvent, keys } from '../../api/queries'

/** Keep the actual poster in both snapshots, including a cold click before hover prefetch finishes. */
export function useEventNavigation(eventId: number) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])
  const prepare = () => Promise.all([
    queryClient.ensureQueryData({ queryKey: keys.event(eventId), queryFn: () => fetchEvent(eventId) }),
    import('../event/EventPage'),
  ])
  const warm = () => { void prepare().catch(() => {}) }
  async function open(click: MouseEvent<HTMLAnchorElement>) {
    if (click.button !== 0 || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return
    click.preventDefault()
    try { await prepare() } catch { /* The destination route displays the request error. */ }
    if (active.current) void navigate(`/events/${eventId}`, { viewTransition: true })
  }
  return { warm, open }
}
