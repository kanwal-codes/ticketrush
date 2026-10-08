/** One message from a Server-Sent Events stream. */
export interface SseMessage {
  event?: string
  data: string
}

/**
 * Reads a Server-Sent Events response body and yields its messages. This is done by hand because the browser's
 * EventSource cannot send an Authorization header, and the waiting room stream needs one.
 *
 * Handles what a real network does: a message split across chunks (even in the middle of a multi-byte
 * character), CRLF line endings, comment lines used as heartbeats, and data spread over several lines.
 */
export async function* parseEventStream(body: ReadableStream<Uint8Array>): AsyncGenerator<SseMessage> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let event: string | undefined
  let data: string[] = []

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      buffer += decoder.decode(value, { stream: true })

      for (;;) {
        const newline = /\r\n|\n|\r/.exec(buffer)
        if (!newline) break
        // A lone CR at the very end might be the first half of CRLF, so wait for the next chunk.
        if (newline[0] === '\r' && newline.index === buffer.length - 1) break
        const line = buffer.slice(0, newline.index)
        buffer = buffer.slice(newline.index + newline[0].length)

        if (line === '') {
          if (data.length > 0) yield { event, data: data.join('\n') }
          event = undefined
          data = []
        } else if (!line.startsWith(':')) {
          const colon = line.indexOf(':')
          const field = colon === -1 ? line : line.slice(0, colon)
          const raw = colon === -1 ? '' : line.slice(colon + 1)
          const value = raw.startsWith(' ') ? raw.slice(1) : raw
          if (field === 'event') event = value
          else if (field === 'data') data.push(value)
        }
      }
    }
  } finally {
    // Whoever stops reading (or an error) releases the connection.
    await reader.cancel().catch(() => undefined)
  }
}
