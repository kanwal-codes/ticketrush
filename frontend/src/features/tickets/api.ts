import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api, unwrap } from '../../api/client'
import { getToken } from '../../auth/session'

export const ticketKeys = { all: ['tickets'] as const }

export function useTickets() {
  return useQuery({ queryKey: ticketKeys.all, queryFn: () => unwrap(api.GET('/api/tickets')), refetchOnWindowFocus: true })
}

/**
 * A ticket's QR code. It is private to its owner, so the request must carry the sign-in token, which an <img src>
 * cannot do. Fetch it, and show it from a local object URL that is released when the ticket goes away.
 */
export function useQrImage(ticketId: number, enabled = true): { url?: string; failed: boolean } {
  const [state, setState] = useState<{ url?: string; failed: boolean }>({ failed: false })

  useEffect(() => {
    if (!enabled) return
    const abort = new AbortController()
    let objectUrl: string | undefined
    fetch(new URL(`/api/tickets/${ticketId}/qr.svg`, location.origin), { headers: { Authorization: `Bearer ${getToken() ?? ''}` }, signal: abort.signal })
      .then((response) => (response.ok ? response.blob() : Promise.reject(new Error(String(response.status)))))
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob)
        setState({ url: objectUrl, failed: false })
      })
      .catch(() => {
        if (!abort.signal.aborted) setState({ failed: true })
      })
    return () => {
      abort.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [ticketId, enabled])

  return state
}
