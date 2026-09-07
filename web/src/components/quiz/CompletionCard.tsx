import { THEME_DARK } from '../../theme.ts'
import { Q, RADIUS } from './tokens.ts'

const T = THEME_DARK

interface Props {
  correctCount: number
  total: number
  xpToday: number
  bottomInset: number
  onRestart: () => void
}

export function CompletionCard({ correctCount, total, xpToday, bottomInset, onRestart }: Props) {
  const accuracy = total > 0 ? Math.round((correctCount / total) * 100) : 0
  const stats = [
    { label: '答對', value: `${correctCount}/${total}` },
    { label: '今日 XP', value: String(xpToday) },
    { label: '正確率', value: `${accuracy}%` },
  ]

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '0 28px',
      paddingBottom: bottomInset,
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: 999, background: Q.correct,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: Q.onSolid, fontSize: 36, fontWeight: 700, marginBottom: 20,
        animation: 'quizZoom 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
      }}>✓</div>

      <div style={{
        fontFamily: T.serif, fontSize: 26, fontWeight: 700, color: T.ink, marginBottom: 26,
        animation: 'quizFadeUp 0.35s ease-out 0.12s both',
      }}>今日完成！</div>

      <div style={{
        display: 'flex', gap: 12, alignSelf: 'stretch',
        animation: 'quizFadeUp 0.35s ease-out 0.2s both',
      }}>
        {stats.map(s => (
          <div key={s.label} style={{
            flex: 1, background: T.card, borderRadius: RADIUS.card,
            border: `1px solid ${T.ruleSoft}`, padding: '18px 8px', textAlign: 'center',
          }}>
            <div style={{ fontFamily: T.mono, fontSize: 22, fontWeight: 700, color: T.ink }}>{s.value}</div>
            <div style={{ fontFamily: T.mono, fontSize: 10, color: T.inkMuted, marginTop: 6 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ alignSelf: 'stretch', marginTop: 32, animation: 'quizFadeUp 0.35s ease-out 0.28s both' }}>
        <button
          className="btn-press"
          onClick={onRestart}
          style={{
            width: '100%', height: 52, borderRadius: RADIUS.button, border: 'none',
            background: T.accent, color: Q.onSolid,
            fontFamily: T.sans, fontSize: 15, fontWeight: 700,
          }}
        >再來一輪</button>
      </div>
    </div>
  )
}
