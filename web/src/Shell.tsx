import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { BottomNav } from './components/BottomNav.tsx'
import { NavInsetContext, tabForPath } from './nav.ts'

interface Props {
  /** Current pathname, owned by main.tsx so active tab and rendered page can
   *  never disagree — Shell never reads window.location itself. */
  path: string
  children: ReactNode
}

/**
 * App shell: the extended-root layer that every page renders inside, plus the
 * persistent bottom nav.
 *
 * Layout model (docs/FRONTEND_FIX_LOG.md Issue 6 — read it before changing
 * anything here):
 *   - `index.css` extends `html` to `100dvh + env(safe-area-inset-bottom)`
 *   - `#root` is `position: relative`, so this absolute layer's `height: 100%`
 *     is the extended height, not the clipped dynamic viewport
 *   - the nav is an absolute layer at `bottom: 0` inside it, owning the bottom
 *     safe-area band
 * Do not reintroduce a fixed footer or a negative safe-area offset.
 */
export function Shell({ path, children }: Props) {
  const navRef = useRef<HTMLElement | null>(null)
  const [navInset, setNavInset] = useState(0)

  // env(safe-area-inset-bottom) is not readable as a number from JS, and
  // ArticleCard needs a real px value, so measure the rendered nav instead.
  useLayoutEffect(() => {
    const el = navRef.current
    if (!el) return
    const update = () => setNavInset(el.getBoundingClientRect().height)
    update()
    // border-box, not the default content-box: the nav's height changes come
    // from `padding-bottom: env(safe-area-inset-bottom)`, and padding does not
    // move the content box — a content-box observer never fires for it.
    const ro = new ResizeObserver(update)
    ro.observe(el, { box: 'border-box' })
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  return (
    <div style={{
      position: 'absolute',
      top: 0, left: 0, right: 0,
      height: '100%',
    }}>
      <NavInsetContext.Provider value={navInset}>
        {children}
      </NavInsetContext.Provider>
      <BottomNav ref={navRef} active={tabForPath(path)} />
    </div>
  )
}
