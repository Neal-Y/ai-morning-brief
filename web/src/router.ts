// Minimal pathname-based router shared by App + Library. Lives in its own
// file so Library can import navigate without pulling main.tsx (which would
// transitively import App and create a cycle).

export function navigate(path: string): void {
  if (window.location.pathname === path) return
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
