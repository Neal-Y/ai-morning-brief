// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AskSheet } from './AskSheet.tsx'
import { THEME_DARK } from '../theme.ts'
import type { Article } from '../types.ts'
import { apiFetch } from '../api.ts'
import { loadAskHistory, saveAskHistory } from '../askHistory.ts'

vi.mock('../api.ts', () => ({ apiFetch: vi.fn() }))
vi.mock('../askHistory.ts', () => ({ loadAskHistory: vi.fn(), saveAskHistory: vi.fn() }))

const article = {
  id: 'aaaaaaaaaaaaaaaa', url: 'https://example.com', title: 'T', summary: 'S', context: 'C',
  engineeringImpact: 'E', reason: 'R', shortJudgment: null, categoryTag: '#infra', skillTags: [],
  renderLevel: 'FULL', recommendation: 'READ_NOW', score: 80, source: 'X', briefDate: '2026-10-02', classifiedAt: null,
} as unknown as Article

function stream(lines: string[]): Response {
  return new Response(new ReadableStream({
    start(c) { c.enqueue(new TextEncoder().encode(lines.map((l) => `data: ${l}\n\n`).join(''))); c.close() },
  }), { status: 200 })
}

let root: Root
let container: HTMLDivElement

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0))
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
  vi.mocked(saveAskHistory).mockResolvedValue(2)
  // jsdom has no layout: scrolling is a no-op here.
  Element.prototype.scrollTo = () => {}
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
  vi.unstubAllGlobals()
})

async function openAndAsk(answer: string[]) {
  vi.mocked(apiFetch).mockImplementation(async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { mode?: string }
    if (body.mode === 'suggest') throw new Error('offline')
    return stream(answer)
  })
  await act(async () => {
    root.render(<AskSheet theme={THEME_DARK} article={article} visible onClose={() => {}} />)
  })
  await act(async () => { await new Promise((r) => setTimeout(r, 400)) })
  const input = container.querySelector('input')!
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, '有什麼影響？')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const send = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'SEND')!
  await act(async () => { send.click() })
  await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
}

describe('AskSheet', () => {
  it('saves a complete answer', async () => {
    vi.mocked(loadAskHistory).mockResolvedValue({ messages: [], messageCount: 0 })
    await openAndAsk(['"完整"', '"回答"', '[DONE]'])
    expect(saveAskHistory).toHaveBeenCalledWith(article.id, [
      { role: 'user', content: '有什麼影響？' }, { role: 'assistant', content: '完整回答' },
    ])
  })

  it('keeps an interrupted answer on screen but never saves it', async () => {
    vi.mocked(loadAskHistory).mockResolvedValue({ messages: [], messageCount: 0 })
    await openAndAsk(['"半截"', '[ERROR]'])
    expect(container.textContent).toContain('半截')
    expect(container.textContent).toContain('回答中斷了')
    expect(saveAskHistory).not.toHaveBeenCalled()
  })

  it('does not overwrite a saved thread it failed to load', async () => {
    vi.mocked(loadAskHistory).mockRejectedValue(new Error('HTTP 500'))
    await openAndAsk(['"完整"', '[DONE]'])
    expect(container.textContent).toContain('先前的追問紀錄暫時載入失敗')
    expect(container.textContent).toContain('完整')
    expect(saveAskHistory).not.toHaveBeenCalled()
  })
})
