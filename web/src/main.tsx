import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import Library from './Library.tsx'
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

// Minimal pathname-based routing. Two pages today (today / library); pulling
// in react-router for that is overkill. `navigate()` from any component pushes
// state and dispatches popstate so this Root re-renders without a full reload.
function Root() {
  const [path, setPath] = useState(window.location.pathname)
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  if (path === '/library') return <Library />
  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
