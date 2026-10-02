// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.tsx'
import type { FeedResponse } from './types.ts'
import { apiFetch, fetchActivity, type ActivityData } from './api.ts'
import { fetchFeed, readLocalFeed, readPushPrefetchedFeed, writeLocalFeed } from './feedLoader.ts'

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
let serviceWorker: EventTarget

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-01T02:00:00Z'))
  vi.clearAllMocks()
  vi.mocked(apiFetch).mockImplementation(async () => Response.json({ ok: true }))
  vi.mocked(fetchActivity).mockResolvedValue({ streak: 0, activeToday: false } as ActivityData)
  vi.mocked(readPushPrefetchedFeed).mockResolvedValue(null)
  vi.mocked(fetchFeed).mockReset().mockResolvedValue(feed)
  serviceWorker = new EventTarget()
  vi.stubGlobal('navigator', { serviceWorker })
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  // Use the browser's storage, including on Node versions with native storage.
  vi.stubGlobal('localStorage', jsdom.window.localStorage)
  localStorage.clear()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  })
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network request') }))
  vi.mocked(readLocalFeed).mockImplementation(date => date === feed.date ? feed : null)
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
  vi.restoreAllMocks()
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
    body: JSON.stringify({ articleId: feed.articles[0]!.id, signal: 'read' }),
  }))
  expect(JSON.parse(localStorage.getItem('mb_feed_session')!).idx).toBe(1)
  expect(container.textContent).toContain('2/3')
}

describe('feed transitions', () => {
  it('rapid buttons and arrow keys submit once and advance exactly one article', async () => {
    await act(async () => {
      button('下一篇').click()
      button('少看這類').click()
      arrow('ArrowRight')
    })
    await act(async () => { vi.advanceTimersByTime(260) })
    expectOneAdvance()

    // The lock must release for the next card.
    await act(async () => { button('下一篇').click() })
    await act(async () => { vi.advanceTimersByTime(260) })
    expect(apiFetch).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain('3/3')
    expect(JSON.parse(localStorage.getItem('mb_feed_session')!).feedback).toEqual({})
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
      button('少看這類').click()
      arrow('ArrowRight')
    })
    await act(async () => { vi.advanceTimersByTime(260) })
    expectOneAdvance()
  })
})


describe('feed refresh', () => {
  it('keeps the same-day reading position and reactions after returning to foreground', async () => {
    await act(async () => { button('多看這類').click() })
    await act(async () => { vi.advanceTimersByTime(260) })
    const updated = { ...feed, articles: feed.articles.map(a => ({ ...a, summary: 'Updated summary' })) }
    vi.mocked(fetchFeed).mockResolvedValueOnce(updated)
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(container.textContent).toContain('2/3')
    expect(container.textContent).toContain('Updated summary')
    expect(JSON.parse(localStorage.getItem('mb_feed_session')!).feedback).toEqual({ [feed.articles[0]!.id]: 'up' })
    expect(apiFetch).toHaveBeenCalledTimes(1)
  })

  it('loads the new day and resets yesterday’s completed progress even if IDs match', async () => {
    for (let i = 0; i < 3; i++) {
      await act(async () => { button(i === 2 ? '看完今日簡報' : '下一篇').click() })
      await act(async () => { vi.advanceTimersByTime(260) })
    }
    expect(container.textContent).toContain("That's it for")
    vi.setSystemTime(new Date('2026-10-02T02:00:00Z'))
    const nextDay = { ...feed, date: '2026-10-02' }
    vi.mocked(fetchFeed).mockResolvedValueOnce(nextDay)
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(fetchFeed).toHaveBeenLastCalledWith('2026-10-02')
    expect(container.textContent).toContain('1/3')
    expect(JSON.parse(localStorage.getItem('mb_feed_session')!)).toMatchObject({ date: '2026-10-02', idx: 0, feedback: {} })
  })

  it('refreshes an empty brief when a notification targets the already open feed', async () => {
    await act(async () => { root.unmount() })
    localStorage.clear()
    vi.mocked(readLocalFeed).mockReturnValue(null)
    vi.mocked(fetchFeed).mockResolvedValueOnce({ date: feed.date, articles: [] })
    root = createRoot(container)
    await act(async () => { root.render(<App />) })
    expect(container.textContent).toContain('NO ARTICLES TODAY')
    vi.mocked(fetchFeed).mockResolvedValueOnce(feed)
    await act(async () => { serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'navigate', url: '/' } })) })
    expect(fetchFeed).toHaveBeenLastCalledWith(feed.date, { fresh: true })
    expect(container.textContent).toContain('Article 1')
    expect(container.textContent).not.toContain('NO ARTICLES TODAY')
  })

  it('does not erase today’s published brief or progress with a stale empty response', async () => {
    await act(async () => { button('下一篇').click() })
    await act(async () => { vi.advanceTimersByTime(260) })
    vi.mocked(fetchFeed).mockResolvedValueOnce({ date: feed.date, articles: [] })
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    expect(container.textContent).toContain('Article 2')
    expect(JSON.parse(localStorage.getItem('mb_feed_session')!).idx).toBe(1)
  })

  it('uses a late push-prefetched brief even if an empty network response arrived first', async () => {
    await act(async () => { root.unmount() })
    localStorage.clear()
    vi.mocked(readLocalFeed).mockReturnValue(null)
    let resolvePush!: (value: FeedResponse) => void
    vi.mocked(readPushPrefetchedFeed).mockImplementationOnce(() => new Promise(resolve => { resolvePush = resolve }))
    vi.mocked(fetchFeed).mockResolvedValueOnce({ date: feed.date, articles: [] })
    root = createRoot(container)
    await act(async () => { root.render(<App />) })
    expect(container.textContent).toContain('NO ARTICLES TODAY')
    await act(async () => { resolvePush(feed) })
    expect(container.textContent).toContain('Article 1')
  })

  it('ignores an old-day response that arrives after the new brief', async () => {
    let resolveOld!: (value: FeedResponse) => void
    vi.mocked(fetchFeed).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    vi.setSystemTime(new Date('2026-10-02T02:00:00Z'))
    vi.mocked(fetchFeed).mockResolvedValueOnce({ ...feed, date: '2026-10-02' })
    await act(async () => { window.dispatchEvent(new Event('pageshow')) })
    await act(async () => { resolveOld(feed) })
    expect(JSON.parse(localStorage.getItem('mb_feed_session')!).date).toBe('2026-10-02')
    expect(writeLocalFeed).toHaveBeenLastCalledWith('2026-10-02', expect.objectContaining({ date: '2026-10-02' }))
  })

  it('a publication notification supersedes a request started before publication', async () => {
    await act(async () => { root.unmount() })
    localStorage.clear()
    vi.mocked(readLocalFeed).mockReturnValue(null)
    let resolveEmpty!: (value: FeedResponse) => void
    vi.mocked(fetchFeed).mockImplementationOnce(() => new Promise(resolve => { resolveEmpty = resolve }))
    root = createRoot(container)
    await act(async () => { root.render(<App />) })
    vi.mocked(fetchFeed).mockResolvedValueOnce(feed)
    await act(async () => { serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'navigate', url: '/' } })) })
    expect(fetchFeed).toHaveBeenLastCalledWith(feed.date, { fresh: true })
    await act(async () => { resolveEmpty({ date: feed.date, articles: [] }) })
    expect(container.textContent).toContain('Article 1')
    expect(container.textContent).not.toContain('NO ARTICLES TODAY')
  })

  it('coalesces foreground events while a request is in flight', async () => {
    vi.mocked(fetchFeed).mockClear().mockImplementationOnce(() => new Promise(() => {}))
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new Event('pageshow'))
    })
    expect(fetchFeed).toHaveBeenCalledTimes(1)
  })

  it('refreshes at Taipei midnight when the app stays visible', async () => {
    vi.setSystemTime(new Date('2026-10-01T15:59:59Z'))
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    vi.mocked(fetchFeed).mockResolvedValueOnce({ ...feed, date: '2026-10-02' })
    await act(async () => { await vi.advanceTimersByTimeAsync(1100) })
    expect(fetchFeed).toHaveBeenLastCalledWith('2026-10-02')
    expect(JSON.parse(localStorage.getItem('mb_feed_session')!).date).toBe('2026-10-02')
  })
})
