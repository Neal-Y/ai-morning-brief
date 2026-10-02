import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler, { sanitizeMessages, MAX_ASK_MESSAGES } from '../../api/ask.js'

function sse(events: unknown[]): Response {
  const body = events.map((e) => `event: x\ndata: ${JSON.stringify(e)}\n\n`).join('')
  return new Response(new ReadableStream({
    start(c) { c.enqueue(new TextEncoder().encode(body)); c.close() },
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}
const delta = (text: string) => ({ type: 'content_block_delta', delta: { type: 'text_delta', text } })

async function ask(messages: unknown[]) {
  const res = await handler(new Request('https://x/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Id': 'd' },
    body: JSON.stringify({ articleTitle: 'T', articleSummary: 'S', articleContext: '', messages }),
  }))
  return { status: res.status, text: await res.text() }
}

beforeEach(() => { vi.stubEnv('ANTHROPIC_API_KEY', 'k') })
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('/api/ask stream end', () => {
  it('ends a complete answer with [DONE]', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sse([delta('好'), delta('的'), { type: 'message_stop' }])))
    const { text } = await ask([{ role: 'user', content: 'q' }])
    expect(text).toBe('data: "好"\n\ndata: "的"\n\ndata: [DONE]\n\n')
  })

  it('ends with [ERROR] when the upstream stream reports an error mid-answer', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sse([delta('半'), { type: 'error', error: { type: 'overloaded_error' } }])))
    const { text } = await ask([{ role: 'user', content: 'q' }])
    expect(text).toBe('data: "半"\n\ndata: [ERROR]\n\n')
  })

  it('ends with [ERROR] when the stream stops without message_stop', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sse([delta('半')])))
    expect((await ask([{ role: 'user', content: 'q' }])).text.endsWith('data: [ERROR]\n\n')).toBe(true)
  })
})

describe('/api/ask input bounds', () => {
  it('sends only the recent, valid turns upstream', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sse([{ type: 'message_stop' }]))
    vi.stubGlobal('fetch', fetchMock)
    const long = Array.from({ length: 50 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }))
    await ask([...long, { role: 'user', content: 'x'.repeat(9000) }])
    const sent = JSON.parse(fetchMock.mock.calls[0]![1].body).messages as { role: string; content: string }[]
    expect(sent.length).toBeLessThanOrEqual(MAX_ASK_MESSAGES)
    expect(sent[0]!.role).toBe('user')
    expect(sent.at(-1)!.content).toHaveLength(4000)
  })

  it('rejects a conversation that does not end on a user turn', async () => {
    vi.stubGlobal('fetch', vi.fn())
    expect((await ask([{ role: 'assistant', content: 'hi' }])).status).toBe(400)
    expect(sanitizeMessages([{ role: 'system', content: 'x' }, { role: 'user', content: '' }])).toEqual([])
  })
})
