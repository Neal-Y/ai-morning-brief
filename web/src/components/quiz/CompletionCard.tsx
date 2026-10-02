import { useState } from 'react'
import { THEME_DARK } from '../../theme.ts'
import type { Quiz } from '../../quiz/types.ts'
import { QuizReview } from './QuizReview.tsx'
import { Q, RADIUS } from './tokens.ts'

const T = THEME_DARK

interface Props {
  correctCount: number
  total: number
  xpToday: number
  missed: Quiz[]
  bottomInset: number
  onRestart: () => void
}

export function CompletionCard({ correctCount, total, xpToday, missed, bottomInset, onRestart }: Props) {
  const [reviewing, setReviewing] = useState(false)
  const accuracy = total > 0 ? Math.round((correctCount / total) * 100) : 0
  const stats = [
    { label: '答對', value: `${correctCount}/${total}` },
    { label: '今日 XP', value: String(xpToday) },
    { label: '正確率', value: `${accuracy}%` },
  ]

  if (reviewing) {
    return (
      <section aria-label="這次錯題回顧" style={{
        height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
        paddingBottom: bottomInset,
      }}>
        <header style={{ padding: 'max(20px, env(safe-area-inset-top)) 20px 16px', flexShrink: 0 }}>
          <button
            onClick={() => setReviewing(false)}
            style={{
              background: 'none', border: 'none', padding: '10px 0', color: T.accent,
              fontFamily: T.sans, fontSize: 14, fontWeight: 700,
            }}
          >← 返回完成頁</button>
          <h2 style={{ margin: '8px 0 0', fontSize: 21, fontFamily: T.serif }}>這次答錯的 {missed.length} 題</h2>
        </header>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 20px 24px' }}>
          {missed.map(quiz => (
            <div key={quiz.id} style={{
              background: T.card, border: `1px solid ${T.ruleSoft}`, borderRadius: RADIUS.card,
              padding: 18, marginBottom: 12,
            }}>
              <QuizReview quiz={quiz} />
            </div>
          ))}
        </div>
      </section>
    )
  }

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '0 28px',
      paddingBottom: bottomInset, boxSizing: 'border-box', overflowY: 'auto',
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
            <div style={{ fontFamily: T.mono, fontSize: 11, color: T.inkMuted, marginTop: 6 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ alignSelf: 'stretch', marginTop: 32, animation: 'quizFadeUp 0.35s ease-out 0.28s both' }}>
        {missed.length > 0 && (
          <button
            className="btn-press"
            onClick={() => setReviewing(true)}
            style={{
              width: '100%', minHeight: 52, borderRadius: RADIUS.button, border: 'none',
              background: T.accent, color: Q.onSolid,
              fontFamily: T.sans, fontSize: 15, fontWeight: 700, marginBottom: 12,
            }}
          >回顧這次答錯的 {missed.length} 題</button>
        )}
        <button
          className="btn-press"
          onClick={onRestart}
          style={{
            width: '100%', height: 52, borderRadius: RADIUS.button, border: 'none',
            background: missed.length > 0 ? T.raised : T.accent,
            color: missed.length > 0 ? T.ink : Q.onSolid,
            fontFamily: T.sans, fontSize: 15, fontWeight: 700,
          }}
        >再來一輪</button>
      </div>
    </div>
  )
}
