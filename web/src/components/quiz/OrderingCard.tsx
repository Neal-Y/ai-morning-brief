import { useState } from 'react'
import { THEME_DARK } from '../../theme.ts'
import { shuffleWithOrigin, type OrderingQuiz } from '../../quiz/types.ts'
import { QuizFrame, PrimaryButton, type AnswerAreaApi, type QuizChromeProps } from './QuizFrame.tsx'
import { Q, RADIUS } from './tokens.ts'

const T = THEME_DARK

type Props = Omit<QuizChromeProps, 'id' | 'category' | 'prompt' | 'explanation' | 'source'> & {
  quiz: OrderingQuiz
}

type RowState = 'idle' | 'selected' | 'right' | 'wrong'

export function OrderingCard({ quiz, ...chrome }: Props) {
  const [arrangement, setArrangement] = useState(() => shuffleWithOrigin(quiz.items))
  const [selected, setSelected] = useState<number | null>(null)

  return (
    <QuizFrame
      id={quiz.id}
      category={quiz.category}
      prompt={quiz.prompt}
      explanation={quiz.explanation}
      source={quiz.source}
      {...chrome}
    >
      {({ resolved, resolve }: AnswerAreaApi) => {
        // Tap one row then another to swap them — no drag, so it behaves the
        // same with a mouse, a finger, or a keyboard tap.
        const tap = (i: number) => {
          if (resolved) return
          if (selected === null) { setSelected(i); return }
          if (selected === i) { setSelected(null); return }
          setArrangement(prev => {
            const next = [...prev]
            ;[next[selected], next[i]] = [next[i]!, next[selected]!]
            return next
          })
          setSelected(null)
        }

        const confirm = () => {
          if (resolved) return
          resolve(arrangement.every((it, pos) => it.originalIndex === pos))
        }

        const stateOf = (i: number): RowState => {
          if (resolved) return arrangement[i]!.originalIndex === i ? 'right' : 'wrong'
          return selected === i ? 'selected' : 'idle'
        }

        return (
          <div>
            <p style={{
              margin: '0 0 12px', fontFamily: T.mono, fontSize: 11, color: T.inkMuted,
            }}>點一個選項後再點另一個即可交換位置</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {arrangement.map((item, i) => {
                const state = stateOf(i)
                const p = paletteFor(state)
                return (
                  <button
                    key={item.originalIndex}
                    onClick={() => tap(i)}
                    disabled={resolved}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                      minHeight: 52, padding: '12px 14px', textAlign: 'left',
                      borderRadius: RADIUS.option,
                      border: `1.5px solid ${p.border}`,
                      background: p.bg,
                      boxShadow: state === 'selected' ? '0 10px 20px rgba(0,0,0,0.45)' : 'none',
                      animation: state === 'selected' ? 'quizPulse 1.24s ease-in-out infinite' : undefined,
                      position: state === 'selected' ? 'relative' : undefined,
                      zIndex: state === 'selected' ? 2 : undefined,
                      transition: 'background 0.18s, border-color 0.18s',
                    }}
                  >
                    <span style={{
                      width: 28, height: 28, borderRadius: 9, flexShrink: 0,
                      background: p.slotBg, color: p.slotText,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: T.mono, fontSize: 13, fontWeight: 700,
                    }}>{i + 1}</span>
                    <span style={{
                      flex: 1, fontFamily: T.sans, fontSize: 15, lineHeight: 1.42, color: p.text,
                    }}>{item.value}</span>
                    {state === 'selected' && <span style={{ color: T.accent, fontWeight: 700 }}>⇅</span>}
                    {state === 'right' && <span style={{ color: Q.correct, fontWeight: 700 }}>✓</span>}
                    {state === 'wrong' && <span style={{ color: Q.wrong, fontWeight: 700 }}>✗</span>}
                  </button>
                )
              })}
            </div>

            {!resolved && (
              <div style={{ marginTop: 16 }}>
                <PrimaryButton label="確認順序" onClick={confirm} arrow={false} />
              </div>
            )}
          </div>
        )
      }}
    </QuizFrame>
  )
}

function paletteFor(state: RowState) {
  switch (state) {
    case 'selected':
      // Neutral lift, not a coloured fill: the shadow and the accent ring carry
      // the "picked up" read, so it never looks like a right/wrong verdict.
      return { bg: Q.lift, border: T.accent, slotBg: T.accent, slotText: Q.onSolid, text: T.ink }
    case 'right':
      return { bg: Q.correctTint, border: Q.correct, slotBg: Q.correct, slotText: Q.onSolid, text: T.ink }
    case 'wrong':
      return { bg: Q.wrongTint, border: Q.wrong, slotBg: Q.wrong, slotText: Q.onSolid, text: T.ink }
    default:
      return { bg: T.card, border: T.ruleSoft, slotBg: Q.letterBg, slotText: Q.letterText, text: T.ink }
  }
}
