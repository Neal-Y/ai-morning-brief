import { useEffect, useState } from 'react'
import { getTaipeiDateString } from './date.ts'
import { fetchFeed, readLocalFeed, readPushPrefetchedFeed, writeLocalFeed } from './feedLoader.ts'
import type { FeedResponse } from './types.ts'

/** Refresh the visible day without treating a background refresh as a new session. */
export function useFeed() {
  const [data, setData] = useState<FeedResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false
    let day = ''
    let generation = 0
    let shown = false
    let hasArticles = false
    let inflight: { date: string; promise: Promise<void> } | null = null
    let midnightTimer: ReturnType<typeof setTimeout>

    const refresh = (notification = false) => {
      const today = getTaipeiDateString()
      // A notification announces newly published content. Supersede a request
      // started before it, even on the same day; foreground events coalesce.
      if (!notification && inflight?.date === today) return inflight.promise
      const ticket = ++generation
      const current = () => !disposed && ticket === generation && today === getTaipeiDateString()
      const apply = (next: FeedResponse) => {
        if (!current() || next.date !== today) return
        // A cached empty response from before publication must not erase a
        // brief already shown today (or reset its reading position).
        if (hasArticles && next.articles.length === 0) return
        shown = true
        hasArticles = next.articles.length > 0
        setData(next)
        setLoading(false)
        setError(null)
      }

      if (day !== today) {
        day = today
        shown = false
        hasArticles = false
        setData(null)
        setLoading(true)
        setError(null)
        const local = readLocalFeed(today)
        if (local) apply(local)
        else void readPushPrefetchedFeed(today).then(cached => {
          if (cached && !hasArticles) apply(cached)
        })
      } else if (notification && !hasArticles) {
        void readPushPrefetchedFeed(today).then(cached => {
          if (cached && !hasArticles) apply(cached)
        })
      }

      const promise = (notification ? fetchFeed(today, { fresh: true }) : fetchFeed(today))
        .then(next => {
          if (!current()) return
          if (next.date !== today) throw new Error('Unexpected brief date')
          writeLocalFeed(today, next)
          apply(next)
        })
        .catch(() => {
          if (!current() || shown) return
          setError('無法載入今日簡報，回到 App 時會再試一次')
          setLoading(false)
        })
        .finally(() => {
          if (inflight?.promise === promise) inflight = null
        })
      inflight = { date: today, promise }
      return promise
    }

    const scheduleMidnight = () => {
      clearTimeout(midnightTimer)
      const now = Date.now()
      const dayMs = 86400_000
      const offset = 8 * 3600_000
      const nextMidnight = (Math.floor((now + offset) / dayMs) + 1) * dayMs - offset
      midnightTimer = setTimeout(() => {
        if (document.visibilityState === 'visible') void refresh()
        scheduleMidnight()
      }, nextMidnight - now + 50)
    }
    const onForeground = () => {
      if (document.visibilityState !== 'visible') return
      void refresh()
      scheduleMidnight()
    }
    const onNotification = (event: MessageEvent) => {
      if (event.data?.type === 'navigate' && event.data.url === '/') void refresh(true)
    }

    void refresh()
    scheduleMidnight()
    document.addEventListener('visibilitychange', onForeground)
    window.addEventListener('pageshow', onForeground)
    window.addEventListener('focus', onForeground)
    navigator.serviceWorker?.addEventListener('message', onNotification)
    return () => {
      disposed = true
      clearTimeout(midnightTimer)
      document.removeEventListener('visibilitychange', onForeground)
      window.removeEventListener('pageshow', onForeground)
      window.removeEventListener('focus', onForeground)
      navigator.serviceWorker?.removeEventListener('message', onNotification)
    }
  }, [])

  return { data, loading, error }
}
