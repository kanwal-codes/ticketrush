import { describe, expect, it } from 'vitest'
import { parseEventStream, type SseMessage } from './sse'

function streamOf(chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk)
      controller.close()
    },
  })
}

async function collect(chunks: (string | Uint8Array)[]): Promise<SseMessage[]> {
  const out: SseMessage[] = []
  for await (const message of parseEventStream(streamOf(chunks))) out.push(message)
  return out
}

describe('parseEventStream', () => {
  it('reads named events with their data', async () => {
    expect(await collect(['event: status\ndata: {"state":"WAITING"}\n\n'])).toEqual([{ event: 'status', data: '{"state":"WAITING"}' }])
  })

  it('reads several messages from one chunk', async () => {
    const messages = await collect(['data: one\n\ndata: two\n\n'])
    expect(messages.map((m) => m.data)).toEqual(['one', 'two'])
  })

  it('puts together a message that arrives in pieces, even split inside a line', async () => {
    const messages = await collect(['event: sta', 'tus\nda', 'ta: {"a":', '1}\n', '\n'])
    expect(messages).toEqual([{ event: 'status', data: '{"a":1}' }])
  })

  it('copes with CRLF line endings, including a CRLF split between chunks', async () => {
    const messages = await collect(['data: one\r\n\r', '\ndata: two\r\n\r\n'])
    expect(messages.map((m) => m.data)).toEqual(['one', 'two'])
  })

  it('ignores comment lines, which servers send as heartbeats', async () => {
    const messages = await collect([': keep-alive\n\n', 'data: real\n\n'])
    expect(messages).toEqual([{ event: undefined, data: 'real' }])
  })

  it('joins data spread over several lines', async () => {
    expect((await collect(['data: first\ndata: second\n\n']))[0]?.data).toBe('first\nsecond')
  })

  it('keeps a multi-byte character that is split between chunks', async () => {
    const bytes = new TextEncoder().encode('data: Rivière é\n\n')
    const cut = bytes.indexOf(0xc3) + 1 // between the two bytes of "è"
    const messages = await collect([bytes.slice(0, cut), bytes.slice(cut)])
    expect(messages[0]?.data).toBe('Rivière é')
  })

  it('does not emit a message the connection dropped halfway through', async () => {
    expect(await collect(['data: complete\n\n', 'data: cut off'])).toEqual([{ event: undefined, data: 'complete' }])
  })

  it('does not carry an event name over to the next message', async () => {
    const messages = await collect(['event: status\ndata: a\n\ndata: b\n\n'])
    expect(messages[1]).toEqual({ event: undefined, data: 'b' })
  })

  it('ends when the stream ends', async () => {
    expect(await collect([])).toEqual([])
  })
})
