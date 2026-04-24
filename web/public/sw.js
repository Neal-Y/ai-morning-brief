// Self-unregistering service worker.
//
// Purpose: clean up the VitePWA-generated service worker that used to live at
// this URL. When an iPhone home-screen PWA checks `/sw.js` for updates, it
// will download this new version, install it, activate it, and then this code
// unregisters itself and wipes all caches — leaving the browser in a clean
// "no SW" state. After that, the app loads straight from the network like a
// normal website.
//
// Safe to delete this file once you're confident no user still has the old
// VitePWA service worker registered.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    } catch (_) { /* ignore */ }
    try {
      await self.registration.unregister()
    } catch (_) { /* ignore */ }
    const clients = await self.clients.matchAll({ type: 'window' })
    clients.forEach((c) => c.navigate(c.url))
  })())
})
