// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { apiFetch } from './api.ts'
import { fetchFeed } from './feedLoader.ts'
import type { FeedResponse } from './types.ts'

vi.mock('./api.ts', () => ({ apiFetch: vi.fn(), readCache: vi.fn(), writeCache: vi.fn() }))
const date = '2026-10-02'
const empty: FeedResponse = { date, articles: [] }
const published = { date, articles: [{ id: 'published' }] } as FeedResponse

beforeEach(() => {
  vi.clearAllMocks()
  delete window.__siftFeed
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network request') }))
})
afterEach(() => {
  delete window.__siftFeed
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('keeps the early request and canonical URL for ordinary opens and foreground refreshes', async () => {
  window.__siftFeed = { date, promise: Promise.resolve(published) }
  expect(await fetchFeed(date)).toBe(published)
  expect(apiFetch).not.toHaveBeenCalled()
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json(published))
  expect(await fetchFeed(date)).toEqual(published)
  expect(apiFetch).toHaveBeenCalledExactlyOnceWith(`/api/feed?date=${date}`)
})

it('notification refresh bypasses both an early empty result and the canonical empty CDN entry', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(1790913600000)
  window.__siftFeed = { date, promise: Promise.resolve(empty) }
  vi.mocked(apiFetch).mockImplementation(async (url) => {
    const parsed = new URL(url, 'https://sift.test')
    return Response.json(parsed.searchParams.has('refresh') ? published : empty)
  })

  expect(await fetchFeed(date, { fresh: true })).toEqual(published)
  expect(apiFetch).toHaveBeenCalledExactlyOnceWith(
    `/api/feed?date=${date}&refresh=1790913600000`, { cache: 'no-store' },
  )
  expect(window.__siftFeed).toBeUndefined()
})
