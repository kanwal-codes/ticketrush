import { vi } from 'vitest'

type Handler = (request: Request) => Response | Promise<Response>

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

/**
 * Replaces fetch with a table of "METHOD /path" to handler (the path without the query string). Anything not in
 * the table fails the test loudly, so a screen cannot quietly call something the test did not expect.
 */
export function mockApi(routes: Record<string, Handler>) {
  const calls: Request[] = []
  const impl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init)
    calls.push(request.clone())
    const url = new URL(request.url)
    const handler = routes[`${request.method} ${url.pathname}`]
    if (!handler) throw new Error(`Unexpected request: ${request.method} ${url.pathname}${url.search}`)
    return handler(request)
  }
  vi.stubGlobal('fetch', vi.fn(impl))
  return { calls }
}

/** A server-sent events response the test can push messages into, one at a time, and close. */
export function sseStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({ start: (c) => (controller = c) })
  return {
    response: new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    send(data: unknown, event = 'status') {
      controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
    },
    close() {
      controller.close()
    },
  }
}
