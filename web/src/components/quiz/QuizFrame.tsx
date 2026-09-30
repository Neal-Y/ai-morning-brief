import { useRef, useState, type ReactNode } from 'react'
import { THEME_DARK } from '../../theme.ts'
import type { Article } from '../../types.ts'
import { AskSheet, type QuizAskContext } from '../AskSheet.tsx'
import { Q, RADIUS, XP } from './tokens.ts'
import { IconBolt, IconFlame, StatChip } from '../icons.tsx'
import { reportQuiz, type QuizReportReason } from '../../api.ts'

const T = THEME_DARK

export interface AnswerAreaApi {
  resolved: boolean
  /** `yourAnswer` is a plain-text rendering of what the user submitted, for Ask. */
  resolve: (correct: boolean, yourAnswer?: string) => void
}

export interface QuizChromeProps {
  id: string
  category: string
  prompt: string
  explanation: string
  source: { name: string; url: string } | null
  /** Missed before and due again — shown as a 複習 tag next to the category. */
  review?: boolean
  /** Answer-free question material + the answer key, for the Ask follow-up. */
  ask?: { material: string; correctAnswer: string }
  index: number
  total: number
  streak: number
  xpToday: number
  isLast: boolean
  bottomInset: number
  /** Fired once when the question is answered — the attempt is recorded here. */
  onResolve: (correct: boolean) => void
  onNext: () => void
  /** Leave an unanswered question without recording an attempt (after reporting it). */
  onSkip: () => void
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
  id, category, prompt, explanation, source, review = false, ask,
  index, total, streak, xpToday, isLast, bottomInset, onResolve, onNext, onSkip, children,
}: Props) {
  const [resolved, setResolved] = useState(false)
  const [correct, setCorrect] = useState(false)
  const [yourAnswer, setYourAnswer] = useState<string | undefined>(undefined)
  const [askOpen, setAskOpen] = useState(false)
  const [reportState, setReportState] = useState<'idle' | 'choosing' | 'sending' | 'done' | 'failed'>('idle')

  const sendReport = async (reason: QuizReportReason) => {
    const quizId = Number(id)
    if (!Number.isFinite(quizId)) return
    setReportState('sending')
    setReportState(await reportQuiz(quizId, reason) ? 'done' : 'failed')
  }
  const scrollRef = useRef<HTMLDivElement>(null)

  const resolve = (isCorrect: boolean, answer?: string) => {
    if (resolved) return
    setResolved(true)
    setCorrect(isCorrect)
    setYourAnswer(answer)
    onResolve(isCorrect)
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

  // What Ask knows depends on where you are: before answering it gets the
  // question and material only (no explanation, no key) so it can't spoil it.
  const quizAsk: QuizAskContext = {
    prompt,
    material: ask?.material ?? '',
    answered: resolved,
    ...(resolved ? {
      correct,
      yourAnswer,
      correctAnswer: ask?.correctAnswer,
      explanation,
    } : {}),
  }

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
              flex: 1, height: 4, borderRadius: 999,
              background: i < index ? T.accent : i === index ? T.ink : Q.track,
              transition: 'background 0.25s',
            }} />
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatChip icon={<IconFlame />} value={streak} color={T.accent} background={T.accentSoft} />
          <span style={{ position: 'relative' }}>
            <StatChip icon={<IconBolt color={T.accent} />} value={xpToday} color={T.ink} background={T.raised} />
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
        fontFamily: T.sans, fontSize: 12, letterSpacing: 0.3,
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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            <div style={{
              background: T.accentSoft, color: T.accent,
              borderRadius: RADIUS.pill, padding: '5px 12px',
              fontFamily: T.mono, fontSize: 11, fontWeight: 700, letterSpacing: 1,
            }}>{category}</div>
            {review && (
              <div style={{
                background: Q.wrongTint, color: Q.wrong,
                borderRadius: RADIUS.pill, padding: '5px 12px',
                fontFamily: T.sans, fontSize: 11, fontWeight: 700,
              }}>複習 · 之前答錯</div>
            )}
          </div>

          <h1 style={{
            fontFamily: T.serif, fontSize: 24, lineHeight: 1.32, fontWeight: 700,
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {reportState === 'idle' && (
              // Low-key on purpose: most questions are fine, this is the escape
              // hatch for the ones that aren't (api/quiz-report.ts).
              <button
                onClick={() => setReportState('choosing')}
                aria-label="回報這題有問題"
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: 'none', border: 'none', padding: '7px 4px',
                  fontFamily: T.sans, fontSize: 12, color: T.inkFaint,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 21V4h11l-1.5 4L16 12H5" />
                </svg>
                回報
              </button>
            )}
            <button
              className="btn-press"
              onClick={() => setAskOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: T.raised, border: 'none', boxShadow: T.highlight,
                borderRadius: RADIUS.pill, padding: '7px 13px 7px 11px',
                fontFamily: T.sans, fontSize: 12, fontWeight: 600, color: T.ink,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4 19.5l1.3-4.6A7.5 7.5 0 1 1 20 11.5z" />
              </svg>
              追問
            </button>
            </div>
          </div>

          {reportState !== 'idle' && (
            <div style={{
              marginTop: 10, padding: '10px 12px', borderRadius: RADIUS.option,
              background: T.raised, animation: 'quizFadeUp 0.25s ease-out both',
            }}>
              {reportState === 'choosing' || reportState === 'sending' ? (
                <>
                  <div style={{ fontFamily: T.sans, fontSize: 12, color: T.inkMuted, marginBottom: 8 }}>
                    這題哪裡有問題？回報後它不會再出現，出題時也會避開類似的題目。
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {([
                      ['wrong_answer', '答案有誤'],
                      ['unclear', '題意不清'],
                      ['too_easy', '太簡單'],
                      ['other', '其他'],
                    ] as [QuizReportReason, string][]).map(([reason, label]) => (
                      <button
                        key={reason}
                        disabled={reportState === 'sending'}
                        onClick={() => void sendReport(reason)}
                        style={{
                          border: 'none', borderRadius: RADIUS.pill, padding: '7px 12px',
                          background: T.card, color: T.ink, boxShadow: T.highlight,
                          fontFamily: T.sans, fontSize: 12, fontWeight: 600,
                          opacity: reportState === 'sending' ? 0.5 : 1,
                        }}
                      >{label}</button>
                    ))}
                    <button
                      onClick={() => setReportState('idle')}
                      style={{
                        border: 'none', background: 'none', padding: '7px 8px',
                        fontFamily: T.sans, fontSize: 12, color: T.inkFaint,
                      }}
                    >取消</button>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    flex: 1, fontFamily: T.sans, fontSize: 12,
                    color: reportState === 'done' ? T.inkMuted : Q.wrong,
                  }}>
                    {reportState === 'done'
                      ? '已回報，這題之後不會再出現。'
                      : '回報沒送出，請稍後再試。'}
                  </div>
                  {reportState === 'done' && !resolved && (
                    <button
                      className="btn-press"
                      onClick={onSkip}
                      style={{
                        flexShrink: 0, border: 'none', borderRadius: RADIUS.pill,
                        padding: '7px 14px', background: T.accentSoft, color: T.accent,
                        fontFamily: T.sans, fontSize: 12, fontWeight: 700,
                      }}
                    >{isLast ? '跳過，完成今日' : '跳過這題'}</button>
                  )}
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 20 }}>{children({ resolved, resolve })}</div>

          {resolved && (
            <div style={{
              marginTop: 16, borderRadius: RADIUS.card, padding: 16,
              background: correct ? Q.correctTint : Q.wrongTint,
              border: `1px solid ${correct ? 'rgba(61,214,140,0.25)' : 'rgba(255,107,107,0.25)'}`,
              animation: 'quizFadeUp 0.35s ease-out 0.12s both',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  width: 22, height: 22, borderRadius: 999,
                  background: correct ? Q.correct : Q.wrong, color: Q.onSolid,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: T.sans, fontSize: 13, fontWeight: 700,
                }}>{correct ? '✓' : '✕'}</span>
                <span style={{
                  flex: 1, fontFamily: T.serif, fontSize: 16, fontWeight: 700, color: T.ink,
                }}>{correct ? '答對了！' : '答錯了'}</span>
                <span style={{
                  fontFamily: T.mono, fontSize: 13, fontWeight: 700,
                  color: correct ? Q.correct : Q.wrong,
                  fontVariantNumeric: 'tabular-nums',
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
          <PrimaryButton label={isLast ? '完成今日' : '下一題'} onClick={onNext} />
        </div>
      )}

      <AskSheet
        theme={T}
        article={asArticle}
        quiz={quizAsk}
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
        width: '100%', height: 54, borderRadius: RADIUS.button, border: 'none',
        background: T.accent,
        color: T.onAccent, fontFamily: T.sans, fontSize: 15, fontWeight: 700,
        letterSpacing: 0.3,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        boxShadow: '0 10px 28px rgba(245,165,36,0.28), inset 0 1px 0 rgba(255,255,255,0.35)',
      }}
    >
      {label}
      {arrow && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      )}
    </button>
  )
}
