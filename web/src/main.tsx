import { StrictMode, Suspense, lazy, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { navigate } from './router.ts'
import { Shell } from './Shell.tsx'
import './index.css'

async function registerSW(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  try {
    await navigator.serviceWorker.register('/sw.js')
  } catch (err) {
    console.warn('[sw] Registration failed:', err)
  }
}

void registerSW()

// Feed (`/`) is the start_url and push landing page, so it ships in the main
// bundle; the other tabs load on demand and are prefetched once the browser is
// idle, so switching tabs stays instant (2026-10-01: the single 407 KB bundle
// was the first ~third of the ~1s it took to open the app on a phone).
const loadQuiz = () => import('./Quiz.tsx')
const loadLibrary = () => import('./Library.tsx')
const loadActivity = () => import('./Activity.tsx')
const Quiz = lazy(loadQuiz)
const Library = lazy(loadLibrary)
const Activity = lazy(loadActivity)

function prefetchTabs() {
  void loadQuiz(); void loadLibrary(); void loadActivity()
}
const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback
if (idle) idle(prefetchTabs, { timeout: 4000 })
else setTimeout(prefetchTabs, 2500)

// Minimal pathname-based routing. `navigate()` from any component pushes state
// and dispatches popstate so this Root re-renders without a full reload —
// still not worth pulling in react-router for four pages.
//
// Root owns `path` and hands it to Shell, so the rendered page and the lit tab
// come from one source of truth.
function pageFor(path: string) {
  switch (path) {
    case '/quiz': return <Quiz />
    case '/library': return <Library />
    case '/activity': return <Activity />
    default: return <App />
  }
}

function Root() {
  const [path, setPath] = useState(window.location.pathname)
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    // A notification tap while the app is already open: sw.js focuses this
    // window and posts the target path (e.g. the afternoon reminder → /quiz).
    const onSwMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; url?: string } | null
      if (data?.type === 'navigate' && typeof data.url === 'string' && data.url.startsWith('/')) navigate(data.url)
    }
    navigator.serviceWorker?.addEventListener('message', onSwMessage)
    return () => {
      window.removeEventListener('popstate', onPop)
      navigator.serviceWorker?.removeEventListener('message', onSwMessage)
    }
  }, [])

  // Fallback is the page background: a chunk that isn't prefetched yet loads
  // in a few ms over HTTP cache, and a spinner would only flash.
  return (
    <Shell path={path}>
      <Suspense fallback={<div style={{ position: 'absolute', inset: 0, background: '#0B121A' }} />}>
        {pageFor(path)}
      </Suspense>
    </Shell>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
