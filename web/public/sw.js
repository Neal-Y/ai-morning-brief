self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Must match FEED_CACHE_NAME in web/src/feedLoader.ts.
const FEED_CACHE = 'sift-feed-v1'

function taipeiDate() {
  const p = {}
  new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date()).forEach((x) => { p[x.type] = x.value })
  return `${p.year}-${p.month}-${p.day}`
}

// The morning push means today's brief was just written: fetch it now so
// tapping the notification opens with the articles already local
// (feedLoader.ts reads this cache). Only today's entry is kept. This is a
// plain Cache Storage write — there is still NO fetch handler, so nothing is
// ever served from cache behind the page's back (FRONTEND_FIX_LOG Issue 14).
async function prefetchTodaysFeed() {
  const url = `/api/feed?date=${taipeiDate()}`
  const res = await fetch(url)
  if (!res.ok) return
  const body = await res.clone().json()
  if (!Array.isArray(body.articles) || body.articles.length === 0) return
  const cache = await caches.open(FEED_CACHE)
  for (const req of await cache.keys()) await cache.delete(req)
  await cache.put(url, res)
}

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/'
  // Show the notification first; the prefetch is best-effort and can never
  // delay or break it.
  const shown = self.registration.showNotification(data.title ?? 'Sift', {
    body: data.body ?? '今日 brief 已就緒',
    icon: '/apple-touch-icon.png',
    badge: '/apple-touch-icon.png',
    // Where a tap should land (e.g. the afternoon reminder opens /quiz).
    data: { url },
  })
  const prefetch = url === '/' ? shown.then(prefetchTodaysFeed).catch(() => {}) : Promise.resolve()
  event.waitUntil(Promise.all([shown, prefetch]))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          // Already open: bring it forward, then route in-app (the page listens
          // for this message and calls navigate(); no full reload).
          if (url !== '/') client.postMessage({ type: 'navigate', url })
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
