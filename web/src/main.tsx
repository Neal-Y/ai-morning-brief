import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import Library from './Library.tsx'
import Quiz from './Quiz.tsx'
import Activity from './Activity.tsx'
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
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  return <Shell path={path}>{pageFor(path)}</Shell>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
