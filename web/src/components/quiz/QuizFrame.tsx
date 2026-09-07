import { useRef, useState, type ReactNode } from 'react'
import { THEME_DARK } from '../../theme.ts'
import type { Article } from '../../types.ts'
import { AskSheet } from '../AskSheet.tsx'
import { Q, RADIUS, XP } from './tokens.ts'

const T = THEME_DARK

export interface AnswerAreaApi {
  resolved: boolean
  resolve: (correct: boolean) => void
}

export interface QuizChromeProps {
  id: string
  category: string
  prompt: string
  explanation: string
  source: { name: string; url: string } | null
  index: number
  total: number
  streak: number
  xpToday: number
  isLast: boolean
  bottomInset: number
  onNext: (correct: boolean) => void
}

interface Props extends QuizChromeProps {
  /** Type-specific answer area; calls `resolve(correct)` once committed. */
  children: (api: AnswerAreaApi) => ReactNode
}

/**
 * Shared chrome for every quiz type: progress dashes, streak / XP, category
 * pill, prompt, source, the +XP fly, the verdict card and the Next button.
 * Type cards supply only the answer area and signal completion via `resolve`.
 */
export function QuizFrame({
  id, category, prompt, explanation, source,
  index, total, streak, xpToday, isLast, bottomInset, onNext, children,
}: Props) {
  const [resolved, setResolved] = useState(false)
  const [correct, setCorrect] = useState(false)
  const [askOpen, setAskOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const resolve = (isCorrect: boolean) => {
    if (resolved) return
    setResolved(true)
    setCorrect(isCorrect)
    // Let the verdict card mount before scrolling it into view.
    setTimeout(() => {
      const el = scrollRef.current
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }, 300)
  }

  // The ask sheet reuses the article follow-up stack wholesale; a synthetic
  // `quiz-<id>` keeps quiz threads separate without a second Ask implementation.
  const asArticle = {
    id: `quiz-${id}`,
    title: prompt,
    summary: explanation,
    context: category,
  } as Article

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 20px 0',
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{ flex: 1, display: 'flex', gap: 5 }}>
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 3, borderRadius: 999,
              background: i < index ? T.accent : i === index ? T.ink : Q.track,
              transition: 'background 0.25s',
            }} />
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: T.mono, fontSize: 12, color: T.ink }}>🔥 {streak}</span>
          <span style={{ position: 'relative', fontFamily: T.mono, fontSize: 12, color: T.ink }}>
            ⚡ {xpToday}
            {resolved && correct && (
              <span
                key={id}
                style={{
                  position: 'absolute', right: 0, top: -2,
                  fontFamily: T.mono, fontSize: 12, fontWeight: 700, color: Q.correct,
                  animation: 'quizXpFly 0.9s ease-out forwards',
                  pointerEvents: 'none',
                }}
              >+{XP.correct}</span>
            )}
          </span>
        </div>
      </div>

      <div style={{
        padding: '10px 20px 0',
        fontFamily: T.mono, fontSize: 9, letterSpacing: 2, textTransform: 'uppercase',
        color: T.inkFaint,
      }}>第 {index + 1} 題 · 共 {total} 題</div>

      <div
        ref={scrollRef}
        style={{
          flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          padding: '16px 20px 0',
        }}
      >
        <div key={id} style={{ animation: 'quizFadeUp 0.45s ease-out both' }}>
          <div style={{
            display: 'inline-block', background: T.accentSoft, color: T.accent,
            borderRadius: RADIUS.pill, padding: '5px 12px', marginBottom: 14,
            fontFamily: T.mono, fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
          }}>{category}</div>

          <h1 style={{
            fontFamily: T.serif, fontSize: 26, lineHeight: 1.28, fontWeight: 700,
            color: T.ink, letterSpacing: -0.3, margin: 0,
          }}>{prompt}</h1>

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, marginTop: 12,
          }}>
            {source ? (
              <a
                href={source.url} target="_blank" rel="noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  fontFamily: T.mono, fontSize: 11, color: T.inkMuted, textDecoration: 'none',
                }}
              >
                <span style={{ width: 5, height: 5, borderRadius: 999, background: T.inkFaint }} />
                {source.name}
              </a>
            ) : <span />}
            <button
              onClick={() => setAskOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'none', border: `1px solid ${T.ruleSoft}`,
                borderRadius: RADIUS.pill, padding: '5px 12px',
                fontFamily: T.mono, fontSize: 11, color: T.inkMuted,
              }}
            >追問</button>
          </div>

          <div style={{ marginTop: 20 }}>{children({ resolved, resolve })}</div>

          {resolved && (
            <div style={{
              marginTop: 16, borderRadius: RADIUS.card, padding: 16,
              background: correct ? Q.correctTint : Q.wrongTint,
              animation: 'quizFadeUp 0.35s ease-out 0.12s both',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  width: 22, height: 22, borderRadius: 999,
                  background: correct ? Q.correct : Q.wrong, color: Q.onSolid,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: T.sans, fontSize: 13, fontWeight: 700,
                }}>{correct ? '✓' : '✗'}</span>
                <span style={{
                  flex: 1, fontFamily: T.serif, fontSize: 16, fontWeight: 700, color: T.ink,
                }}>{correct ? '答對了！' : '答錯了'}</span>
                <span style={{
                  fontFamily: T.mono, fontSize: 13, fontWeight: 700,
                  color: correct ? Q.correct : Q.wrong,
                }}>+{correct ? XP.correct : XP.wrong} XP</span>
              </div>
              <p style={{
                margin: '10px 0 0', fontFamily: T.sans, fontSize: 14, lineHeight: 1.65,
                color: T.inkMuted,
              }}>{explanation}</p>
            </div>
          )}

          <div style={{ height: (resolved ? 96 : 24) + bottomInset }} />
        </div>
      </div>

      {resolved && (
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: bottomInset,
          padding: '10px 20px 14px',
          background: `linear-gradient(to top, ${T.bg} 62%, transparent)`,
          animation: 'quizFadeUp 0.3s ease-out both',
        }}>
          <PrimaryButton label={isLast ? '完成今日' : '下一題'} onClick={() => onNext(correct)} />
        </div>
      )}

      <AskSheet
        theme={T}
        article={asArticle}
        visible={askOpen}
        onClose={() => setAskOpen(false)}
        fullScreen
      />
    </div>
  )
}

export function PrimaryButton({ label, onClick, arrow = true }: {
  label: string; onClick: () => void; arrow?: boolean
}) {
  return (
    <button
      className="btn-press"
      onClick={onClick}
      style={{
        width: '100%', height: 52, borderRadius: RADIUS.button, border: 'none',
        background: `linear-gradient(180deg, #EFE6D4 0%, #D8CCB4 100%)`,
        color: '#1A1612', fontFamily: T.sans, fontSize: 15, fontWeight: 700,
        letterSpacing: 0.3,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        boxShadow: '0 8px 22px rgba(0,0,0,0.35)',
      }}
    >
      {label}
      {arrow && <span style={{ color: T.accent, fontWeight: 700 }}>→</span>}
    </button>
  )
}
