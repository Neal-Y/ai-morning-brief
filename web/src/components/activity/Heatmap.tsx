import { useEffect, useRef, useState } from 'react'
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
const HEAT = ['#1E2A37', '#4A3A17', '#8A6418', T.accent] as const

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Month labels for the 52 columns, derived from today. The grid is "the last
 * 52 weeks ending this week" (column 51 = this week, Monday-based, Taipei) —
 * NOT a calendar year, so hardcoded Jan…Nov positions labelled this week as
 * "Nov". A label goes on the first column whose Monday falls in a new month,
 * skipping one that would crowd the previous label.
 */
function monthLabels(): { week: number; label: string }[] {
  const DAY = 86400_000
  const taipei = new Date(Date.now() + 8 * 3600_000)
  const dow = taipei.getUTCDay()
  const thisMonday = Date.UTC(taipei.getUTCFullYear(), taipei.getUTCMonth(), taipei.getUTCDate()) - (dow === 0 ? 6 : dow - 1) * DAY
  const out: { week: number; label: string }[] = []
  let prevMonth = -1
  for (let week = 0; week < 52; week++) {
    const month = new Date(thisMonday - (51 - week) * 7 * DAY).getUTCMonth()
    if (month !== prevMonth) {
      if (week > 0 && (out.length === 0 || week - out[out.length - 1]!.week >= 3)) {
        out.push({ week, label: MONTH_NAMES[month]! })
      }
      prevMonth = month
    }
  }
  return out
}

export function Heatmap({ data }: { data: number[][] }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  // Current horizontal scroll, so a month label cut by the left edge
  // ("Apr" showing as "pr") is hidden instead of half-drawn.
  const [scrollX, setScrollX] = useState(0)

  // The most recent week is the rightmost column — start there, not at Jan.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollLeft = el.scrollWidth
    setScrollX(el.scrollLeft)
  }, [data])

  return (
    <div style={{
      background: T.card, border: `1px solid ${T.ruleSoft}`,
      borderRadius: 18, padding: 14,
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

      <div ref={scrollRef} onScroll={e => setScrollX(e.currentTarget.scrollLeft)} style={{ overflowX: 'auto', flex: 1 }}>
        <div style={{ width: TOTAL_W }}>
          <div style={{ position: 'relative', height: 12, marginBottom: 6 }}>
            {monthLabels().filter(m => m.week * STRIDE >= scrollX - 1).map(m => (
              <span key={m.week} style={{
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
