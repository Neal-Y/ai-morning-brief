import { THEME_DARK } from '../../theme.ts'
import { useCountUp } from './StatCard.tsx'

const T = THEME_DARK

const SIZE = 96
const STROKE = 14
const R = (SIZE - STROKE) / 2
const C = 2 * Math.PI * R

export interface PieSegment {
  label: string
  value: number
  color: string
}

/** Donut of this week's correct/wrong split, drawn as stroked arcs. */
export function WeekPie({ segments, total }: { segments: PieSegment[]; total: number }) {
  const count = useCountUp(total, 900, 150)

  let offset = 0
  const arcs = segments.map(seg => {
    const frac = total > 0 ? seg.value / total : 0
    const arc = { ...seg, dash: frac * C, offset }
    offset += frac * C
    return arc
  })

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 18,
      background: T.card, border: `1px solid ${T.ruleSoft}`,
      borderRadius: 14, padding: '16px 18px',
    }}>
      <div style={{ position: 'relative', width: SIZE, height: SIZE, flexShrink: 0 }}>
        <svg width={SIZE} height={SIZE} style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={R}
            fill="none" stroke="#2E2820" strokeWidth={STROKE}
          />
          {arcs.map(a => (
            <circle
              key={a.label}
              cx={SIZE / 2} cy={SIZE / 2} r={R}
              fill="none" stroke={a.color} strokeWidth={STROKE}
              strokeDasharray={`${a.dash} ${C - a.dash}`}
              strokeDashoffset={-a.offset}
              style={{ animation: 'pieSweep 0.9s cubic-bezier(0.22,1,0.36,1) 0.15s both' }}
            />
          ))}
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{
            fontFamily: T.mono, fontSize: 21, fontWeight: 700, color: T.ink,
            fontVariantNumeric: 'tabular-nums',
          }}>{count}</span>
          <span style={{ fontFamily: T.mono, fontSize: 9, color: T.inkFaint }}>題</span>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {segments.map(seg => (
          <div key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: seg.color }} />
            <span style={{ flex: 1, fontFamily: T.mono, fontSize: 12, color: T.inkMuted }}>{seg.label}</span>
            <span style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 700, color: T.ink }}>{seg.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
