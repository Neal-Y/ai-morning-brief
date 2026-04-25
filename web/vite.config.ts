import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// NOTE: vite-plugin-pwa was removed on 2026-04-23.
//
// Reason: the plugin generated a second `/manifest.webmanifest` with the wrong
// theme_color (#0f172a) and referenced `/icon-192.png` + `/icon-512.png` that
// do not exist. Combined with the static `/manifest.json` linked from
// `index.html`, iOS standalone PWA was reading conflicting manifests with
// mismatched theme colors, producing a visible seam ("框框") around the status
// bar area in dark mode. The plugin's auto-update service worker also made
// cache invalidation impossible to reason about on real devices.
//
// The app doesn't need offline support — it's a once-a-day read. A static
// manifest in `web/public/manifest.json` is sufficient, and `web/public/sw.js`
// is hand-written: only `push` + `notificationclick` handlers, no fetch /
// cache logic (avoids the cache hell that vite-plugin-pwa caused).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
