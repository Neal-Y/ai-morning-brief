import { useEffect, useRef } from 'react'
import { THEME_DARK } from '../../theme.ts'

const T = THEME_DARK

// `/api/activity` returns 52 columns × 7 rows, column 0 oldest, row 0 = Monday,
// each cell already bucketed to a level 0-3.
const CELL = 10
const GAP = 2
const STRIDE = CELL + GAP
const TOTAL_W = 52 * STRIDE - GAP

// Level 0 is an opaque hex on purpose: T.ruleSoft is rgba and would let the
// card colour bleed through, making empty days look inconsistent.
const HEAT = ['#2E2820', '#5C1F0E', '#9B3218', T.accent] as const

const MONTH_LABELS = [
  { week: 0, label: 'Jan' }, { week: 8, label: 'Mar' }, { week: 17, label: 'May' },
  { week: 26, label: 'Jul' }, { week: 34, label: 'Sep' }, { week: 43, label: 'Nov' },
]

export function Heatmap({ data }: { data: number[][] }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // The most recent week is the rightmost column — start there, not at Jan.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [data])

  return (
    <div style={{
      background: T.card, border: `1px solid ${T.ruleSoft}`,
      borderRadius: 14, padding: 14,
      display: 'flex', alignItems: 'flex-start',
    }}>
      <div style={{
        width: 16, marginTop: 18, display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between',
      }}>
        {['M', '', 'W', '', 'F', '', ''].map((d, i) => (
          <span key={i} style={{
            fontFamily: T.mono, fontSize: 8, color: T.inkFaint,
            height: CELL, lineHeight: `${CELL}px`,
          }}>{d}</span>
        ))}
      </div>

      <div ref={scrollRef} style={{ overflowX: 'auto', flex: 1 }}>
        <div style={{ width: TOTAL_W }}>
          <div style={{ position: 'relative', height: 12, marginBottom: 6 }}>
            {MONTH_LABELS.map(m => (
              <span key={m.label} style={{
                position: 'absolute', left: m.week * STRIDE,
                fontFamily: T.mono, fontSize: 9, color: T.inkFaint,
              }}>{m.label}</span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: GAP }}>
            {data.map((col, ci) => (
              <div
                key={ci}
                style={{
                  display: 'flex', flexDirection: 'column', gap: GAP,
                  // One shared keyframe with a per-column delay, instead of 52
                  // independent animations.
                  animation: 'heatColIn 0.4s ease-out both',
                  animationDelay: `${100 + (ci / data.length) * 420}ms`,
                }}
              >
                {col.map((level, ri) => (
                  <div key={ri} style={{
                    width: CELL, height: CELL, borderRadius: 2,
                    background: HEAT[Math.min(level, 3)] ?? HEAT[0],
                  }} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
