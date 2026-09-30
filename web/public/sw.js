self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Sift', {
      body: data.body ?? '今日 brief 已就緒',
      icon: '/apple-touch-icon.png',
      badge: '/apple-touch-icon.png',
      // Where a tap should land (e.g. the afternoon reminder opens /quiz).
      data: { url: typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/' },
    })
  )
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
