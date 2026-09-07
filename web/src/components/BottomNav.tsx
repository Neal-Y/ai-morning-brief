import { forwardRef } from 'react'
import { THEME_DARK } from '../theme.ts'
import { navigate } from '../router.ts'
import { NAV_ROW_H, TABS, type TabId } from '../nav.ts'

const T = THEME_DARK

interface Props {
  active: TabId
}

/**
 * Persistent four-tab dock.
 *
 * Positioned as an absolute layer at the bottom of Shell's extended root
 * (`100dvh + safe-area-inset-bottom`) — the layout model established in
 * docs/FRONTEND_FIX_LOG.md Issue 6. It owns the bottom safe-area band, so the
 * home indicator never covers a control. Do NOT convert this to a fixed footer
 * and do NOT give it a negative safe-area offset; both were tried and failed.
 */
export const BottomNav = forwardRef<HTMLElement, Props>(function BottomNav({ active }, ref) {
  return (
    <nav
      ref={ref}
      style={{
        position: 'absolute',
        left: 0, right: 0, bottom: 0,
        zIndex: 50,
        background: T.bg,
        borderTop: `1px solid ${T.ruleSoft}`,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div style={{
        maxWidth: 480, margin: '0 auto',
        height: NAV_ROW_H,
        display: 'flex', alignItems: 'stretch',
      }}>
        {TABS.map(tab => {
          const on = tab.id === active
          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)}
              aria-current={on ? 'page' : undefined}
              style={{
                flex: 1,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 4,
                background: 'none', border: 'none', padding: 0,
                color: on ? T.ink : T.inkFaint,
                transition: 'color 0.15s',
              }}
            >
              <TabGlyph id={tab.id} active={on} />
              <span style={{
                fontFamily: T.mono, fontSize: 9, fontWeight: on ? 700 : 500,
                letterSpacing: 0.8, textTransform: 'uppercase',
                color: 'inherit',
              }}>{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
})

/** Geometric marks echoing the Sift app's tab glyphs (✦ ◎ ⊟ ▤), drawn as SVG
 *  so they render identically across platforms. */
function TabGlyph({ id, active }: { id: TabId; active: boolean }) {
  const stroke = 'currentColor'
  const w = active ? 1.9 : 1.5
  const common = {
    width: 17, height: 17, viewBox: '0 0 20 20',
    fill: 'none', stroke, strokeWidth: w,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  }
  switch (id) {
    case 'quiz':
      return (
        <svg {...common}>
          <path d="M10 2.5 L11.9 8.1 L17.5 10 L11.9 11.9 L10 17.5 L8.1 11.9 L2.5 10 L8.1 8.1 Z" />
        </svg>
      )
    case 'feed':
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="7.2" />
          <circle cx="10" cy="10" r="2.6" fill={active ? stroke : 'none'} />
        </svg>
      )
    case 'library':
      return (
        <svg {...common}>
          <rect x="3" y="3.5" width="14" height="13" rx="1.6" />
          <path d="M3 8.2 H17" />
          <path d="M7.4 8.2 V16.5" />
        </svg>
      )
    case 'activity':
      return (
        <svg {...common}>
          <path d="M3 16.5 V9.4" />
          <path d="M7.7 16.5 V4.5" />
          <path d="M12.4 16.5 V11.6" />
          <path d="M17 16.5 V7" />
        </svg>
      )
  }
}
