import { apiFetch, readCache, writeCache } from './api.ts'
import type { FeedResponse } from './types.ts'

// Where today's brief can come from, fastest first (2026-10-01). Opening the
// app used to wait for JS to boot, *then* request /api/feed, then render —
// about a second on a phone.
//
//  1. localStorage (`mb_cache_feed`) — any earlier open today. Synchronous.
//  2. Cache Storage (`sift-feed-v1`) — written by sw.js when the morning push
//     arrives, so tapping the notification opens with the brief already local.
//  3. The request index.html fires before the JS bundle has even downloaded
//     (`window.__siftFeed`), so network and JS parsing overlap.
//  4. A normal fetch, if none of the above applies.
//
// Every source holds the same /api/feed response for the same Taipei date.
// Empty days are never cached: the brief may still land later that morning.

export const FEED_CACHE_NAME = 'sift-feed-v1' // must match web/public/sw.js
const LS_KEY = 'feed'

export function feedUrl(date: string): string {
  return `/api/feed?date=${date}`
}

export function readLocalFeed(date: string): FeedResponse | null {
  const cached = readCache<{ date: string; data: FeedResponse }>(LS_KEY)
  return cached?.date === date && Array.isArray(cached.data?.articles) && cached.data.articles.length > 0
    ? cached.data
    : null
}

export function writeLocalFeed(date: string, data: FeedResponse): void {
  if (data.articles.length > 0) writeCache(LS_KEY, { date, data })
}

export async function readPushPrefetchedFeed(date: string): Promise<FeedResponse | null> {
  try {
    if (!('caches' in window)) return null
    const res = await (await caches.open(FEED_CACHE_NAME)).match(feedUrl(date))
    if (!res) return null
    const data = await res.json() as FeedResponse
    return Array.isArray(data.articles) && data.articles.length > 0 ? data : null
  } catch {
    return null
  }
}

declare global {
  interface Window { __siftFeed?: { date: string; promise: Promise<FeedResponse> } }
}

/** Network copy of today's feed: the early request from index.html when it matches, else a fresh fetch. */
export function fetchFeed(date: string): Promise<FeedResponse> {
  const early = window.__siftFeed
  window.__siftFeed = undefined // single use
  if (early && early.date === date) {
    return early.promise.catch(() => fetchFeedNow(date))
  }
  return fetchFeedNow(date)
}

async function fetchFeedNow(date: string): Promise<FeedResponse> {
  const r = await apiFetch(feedUrl(date))
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json() as Promise<FeedResponse>
}
