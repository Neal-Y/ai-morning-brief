import { useState } from 'react'
import { THEME_DARK } from '../../theme.ts'
import type { FillBlankQuiz } from '../../quiz/types.ts'
import { QuizFrame, PrimaryButton, type AnswerAreaApi, type QuizChromeProps } from './QuizFrame.tsx'
import { Q, RADIUS } from './tokens.ts'

const T = THEME_DARK

type Props = Omit<QuizChromeProps, 'id' | 'category' | 'prompt' | 'explanation' | 'source'> & {
  quiz: FillBlankQuiz
}

type Segment = { kind: 'text'; value: string } | { kind: 'blank'; index: number }

function parseTemplate(template: string): Segment[] {
  const segs: Segment[] = []
  const re = /\{\{(\d+)\}\}/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(template)) !== null) {
    if (m.index > last) segs.push({ kind: 'text', value: template.slice(last, m.index) })
    segs.push({ kind: 'blank', index: Number(m[1]) })
    last = m.index + m[0].length
  }
  if (last < template.length) segs.push({ kind: 'text', value: template.slice(last) })
  return segs
}

export function FillBlankCard({ quiz, ...chrome }: Props) {
  const segments = parseTemplate(quiz.template)
  const [filled, setFilled] = useState<(number | null)[]>(() => quiz.blanks.map(() => null))
  const [activeBlank, setActiveBlank] = useState<number | null>(null)

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
        const used = new Set(filled.filter((w): w is number => w !== null))
        const allFilled = filled.every(w => w !== null)

        const tapBlank = (b: number) => {
          if (resolved) return
          if (filled[b] !== null) {                       // tap a filled blank to clear it
            setFilled(prev => prev.map((w, i) => (i === b ? null : w)))
            setActiveBlank(b)
            return
          }
          setActiveBlank(cur => (cur === b ? null : b))
        }

        const tapWord = (w: number) => {
          if (resolved || used.has(w)) return
          const target = activeBlank ?? filled.findIndex(x => x === null)
          if (target === -1) return
          setFilled(prev => prev.map((x, i) => (i === target ? w : x)))
          setActiveBlank(null)
        }

        const confirm = () => {
          if (resolved || !allFilled) return
          resolve(quiz.blanks.every((ans, b) => quiz.wordBank[filled[b]!] === ans))
        }

        const blankOk = (b: number) => quiz.wordBank[filled[b]!] === quiz.blanks[b]

        return (
          <div>
            <p style={{
              margin: 0, fontFamily: T.sans, fontSize: 16, lineHeight: 2.1, color: T.ink,
            }}>
              {segments.map((seg, si) => {
                if (seg.kind === 'text') return <span key={si}>{seg.value}</span>
                const b = seg.index
                const w = filled[b]
                const p = blankPalette(resolved, activeBlank === b, w !== null,
                  resolved && w !== null ? blankOk(b) : undefined)
                return (
                  <button
                    key={si}
                    onClick={() => tapBlank(b)}
                    disabled={resolved}
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      minWidth: 54, height: 28, margin: '0 3px', padding: '0 10px',
                      verticalAlign: 'middle',
                      borderRadius: 8,
                      border: `1.5px ${w === null ? 'dashed' : 'solid'} ${p.border}`,
                      background: p.bg,
                      color: w === null ? T.inkFaint : p.text,
                      fontFamily: T.sans, fontSize: 14, fontWeight: 700,
                      transition: 'background 0.18s, border-color 0.18s',
                    }}
                  >{w === null ? '＿＿' : quiz.wordBank[w]}</button>
                )
              })}
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 24 }}>
              {quiz.wordBank.map((word, w) => {
                const isUsed = used.has(w)
                return (
                  <button
                    key={w}
                    onClick={() => tapWord(w)}
                    disabled={resolved || isUsed}
                    style={{
                      borderRadius: RADIUS.pill,
                      border: `1.5px solid ${T.ruleSoft}`,
                      background: T.card,
                      padding: '9px 16px',
                      fontFamily: T.sans, fontSize: 14,
                      color: isUsed ? T.inkMuted : T.ink,
                      opacity: isUsed ? 0.32 : 1,
                      transition: 'opacity 0.18s',
                    }}
                  >{word}</button>
                )
              })}
            </div>

            {!resolved && allFilled && (
              <div style={{ marginTop: 24 }}>
                <PrimaryButton label="確認填空" onClick={confirm} arrow={false} />
              </div>
            )}
          </div>
        )
      }}
    </QuizFrame>
  )
}

function blankPalette(resolved: boolean, active: boolean, filled: boolean, correct?: boolean) {
  if (resolved && filled) {
    // Solid semantic fill: a thin border alone is too easy to miss inline.
    return correct
      ? { bg: Q.correct, border: Q.correct, text: T.bg }
      : { bg: Q.wrong, border: Q.wrong, text: T.bg }
  }
  if (active) return { bg: Q.lift, border: T.accent, text: T.ink }
  if (filled) return { bg: T.card, border: T.accent, text: T.ink }
  return { bg: 'transparent', border: T.inkFaint, text: T.inkFaint }
}
