// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.tsx'
import type { FeedResponse } from './types.ts'
import { apiFetch } from './api.ts'
import { readLocalFeed } from './feedLoader.ts'

declare const jsdom: { window: Window }

vi.mock('./api.ts', () => ({
  apiFetch: vi.fn().mockResolvedValue({ ok: true }),
  fetchActivity: vi.fn().mockResolvedValue({ streak: 0, activeToday: false }),
  readCache: vi.fn().mockReturnValue(null),
  writeCache: vi.fn(),
}))
vi.mock('./feedLoader.ts', () => ({
  readLocalFeed: vi.fn(),
  readPushPrefetchedFeed: vi.fn().mockResolvedValue(null),
  fetchFeed: vi.fn(() => new Promise(() => {})),
  writeLocalFeed: vi.fn(),
}))
vi.mock('./push.ts', () => ({
  isPushSupported: () => false,
  isStandalone: () => false,
  completeSubscription: vi.fn(),
}))
vi.mock('./quiz/session.ts', () => ({ prefetchTodaysQuiz: vi.fn() }))
vi.mock('./components/AskSheet.tsx', () => ({ AskSheet: () => null }))

const feed: FeedResponse = {
  date: '2026-10-01',
  articles: [1, 2, 3].map(n => ({
    id: String(n).padStart(16, '0'), url: `https://example.com/${n}`,
    title: `Article ${n}`, summary: 'Summary', context: 'Context',
    engineeringImpact: 'Impact', reason: 'Reason', shortJudgment: null,
    categoryTag: '#tooling', skillTags: '[]', renderLevel: 'FULL',
    recommendation: 'READ_NOW', score: 80, source: 'Example',
    briefDate: '2026-10-01', classifiedAt: null,
  })),
}

let root: Root
let container: HTMLDivElement

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-01T02:00:00Z'))
  vi.clearAllMocks()
  // Use the browser's storage, including on Node versions with native storage.
  vi.stubGlobal('localStorage', jsdom.window.localStorage)
  localStorage.clear()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  })
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network request') }))
  vi.mocked(readLocalFeed).mockReturnValue(feed)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root.render(<App />) })
})

afterEach(async () => {
  await act(async () => { root?.unmount() })
  container?.remove()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function button(label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll('button'))
    .find(el => el.textContent?.trim() === label)
  if (!found) throw new Error(`Missing button: ${label}`)
  return found
}

function arrow(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

function touch(type: string, x: number) {
  // The card gesture surface is the only region with horizontal perspective.
  const surface = Array.from(container.querySelectorAll('div'))
    .find(el => el.style.perspective === '1200px')!
  const event = new Event(type, { bubbles: true })
  Object.defineProperty(event, 'touches', { value: [{ clientX: x, clientY: 100 }] })
  surface.dispatchEvent(event)
}

function expectOneAdvance() {
  expect(apiFetch).toHaveBeenCalledTimes(1)
  expect(apiFetch).toHaveBeenCalledWith('/api/feedback', expect.objectContaining({
    body: JSON.stringify({ articleId: feed.articles[0]!.id, signal: 'up' }),
  }))
  expect(JSON.parse(localStorage.getItem('mb_feed_session')!).idx).toBe(1)
  expect(container.textContent).toContain('2/3')
}

describe('feed transitions', () => {
  it('rapid buttons and arrow keys submit once and advance exactly one article', async () => {
    await act(async () => {
      button('MORE').click()
      button('LESS').click()
      arrow('ArrowRight')
    })
    await act(async () => { vi.advanceTimersByTime(260) })
    expectOneAdvance()

    // The lock must release for the next card.
    await act(async () => { button('MORE').click() })
    await act(async () => { vi.advanceTimersByTime(260) })
    expect(apiFetch).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain('3/3')
  })

  it('a swipe shares the lock with repeated touch ends, buttons, and arrow keys', async () => {
    await act(async () => { touch('touchstart', 0) })
    await act(async () => {
      vi.advanceTimersByTime(20)
      touch('touchmove', 140)
    })
    await act(async () => {
      touch('touchend', 140)
      touch('touchend', 140)
      button('LESS').click()
      arrow('ArrowRight')
    })
    await act(async () => { vi.advanceTimersByTime(260) })
    expectOneAdvance()
  })
})
