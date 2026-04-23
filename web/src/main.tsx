import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// One-time cleanup for the previous VitePWA service worker (2026-04-23 removal).
// Belt-and-suspenders to the self-unregistering sw.js: on every page load,
// actively unregister any leftover service workers and wipe caches. Cheap,
// no-op once there's nothing left to clean.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => { void r.unregister() })
  }).catch(() => { /* ignore */ })
}
if ('caches' in window) {
  caches.keys().then((keys) => {
    keys.forEach((k) => { void caches.delete(k) })
  }).catch(() => { /* ignore */ })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
