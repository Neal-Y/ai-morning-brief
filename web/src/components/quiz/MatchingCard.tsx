import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { THEME_DARK } from '../../theme.ts'
import { shuffleWithOrigin, type MatchingQuiz } from '../../quiz/types.ts'
import { QuizFrame, PrimaryButton, type AnswerAreaApi, type QuizChromeProps } from './QuizFrame.tsx'
import { Q, RADIUS } from './tokens.ts'

const T = THEME_DARK

// A real centre channel gives the connectors room to bow, so even a
// top-left → bottom-right link reads as an S curve rather than a steep slash.
const CHANNEL = 54

type Side = 'L' | 'R'

type Props = Omit<QuizChromeProps, 'id' | 'category' | 'prompt' | 'explanation' | 'source'> & {
  quiz: MatchingQuiz
}

export function MatchingCard({ quiz, ...chrome }: Props) {
  const [right] = useState(() => shuffleWithOrigin(quiz.right))
  const [selected, setSelected] = useState<{ side: Side; index: number } | null>(null)
  const [links, setLinks] = useState<Record<number, number>>({}) // leftIndex -> rightDisplayIndex

  const boardRef = useRef<HTMLDivElement>(null)
  const leftRefs = useRef<(HTMLButtonElement | null)[]>([])
  const rightRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [geom, setGeom] = useState<{ w: number; h: number; leftY: number[]; rightY: number[] }>(
    { w: 0, h: 0, leftY: [], rightY: [] })

  const measure = useCallback(() => {
    const board = boardRef.current
    if (!board) return
    const b = board.getBoundingClientRect()
    const centre = (el: HTMLElement | null) =>
      el ? el.getBoundingClientRect().top - b.top + el.getBoundingClientRect().height / 2 : 0
    setGeom({
      w: b.width,
      h: b.height,
      leftY: quiz.left.map((_, i) => centre(leftRefs.current[i] ?? null)),
      rightY: right.map((_, i) => centre(rightRefs.current[i] ?? null)),
    })
  }, [quiz.left, right])

  useLayoutEffect(() => {
    measure()
    const board = boardRef.current
    if (!board) return
    const ro = new ResizeObserver(measure)
    ro.observe(board)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure])

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
        const leftOfRight = (r: number) =>
          Object.keys(links).map(Number).find(l => links[l] === r)
        const isLinked = (side: Side, i: number) =>
          side === 'L' ? links[i] !== undefined : leftOfRight(i) !== undefined

        const tap = (side: Side, i: number) => {
          if (resolved) return
          if (isLinked(side, i)) {                       // tap a linked cell to unlink
            const l = side === 'L' ? i : leftOfRight(i)!
            setLinks(prev => {
              const next = { ...prev }
              delete next[l]
              return next
            })
            setSelected(null)
            return
          }
          if (!selected) { setSelected({ side, index: i }); return }
          if (selected.side === side) {
            setSelected(selected.index === i ? null : { side, index: i })
            return
          }
          const l = side === 'L' ? i : selected.index
          const r = side === 'R' ? i : selected.index
          setLinks(prev => ({ ...prev, [l]: r }))
          setSelected(null)
        }

        const allLinked = Object.keys(links).length === quiz.left.length
        const confirm = () => {
          if (resolved || !allLinked) return
          resolve(quiz.left.every((_, i) => {
            const r = links[i]
            return r !== undefined && right[r]!.originalIndex === i
          }))
        }

        const colW = geom.w > 0 ? (geom.w - CHANNEL) / 2 : 0
        const x1 = colW
        const x2 = colW + CHANNEL
        const dx = CHANNEL * 0.55
        const linkColor = (l: number) => {
          if (!resolved) return T.accent
          const r = links[l]
          return r !== undefined && right[r]!.originalIndex === l ? Q.correct : Q.wrong
        }
        const isSel = (side: Side, i: number) => selected?.side === side && selected.index === i

        return (
          <div>
            <p style={{
              margin: '0 0 14px', fontFamily: T.mono, fontSize: 11, color: T.inkMuted,
            }}>點兩邊各一項即可配對（再點一次可取消）</p>

            <div ref={boardRef} style={{ position: 'relative' }}>
              {geom.w > 0 && (
                <svg
                  width={geom.w} height={geom.h}
                  style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
                >
                  {Object.keys(links).map(Number).map(l => {
                    const r = links[l]!
                    const y1 = geom.leftY[l]
                    const y2 = geom.rightY[r]
                    if (y1 === undefined || y2 === undefined) return null
                    const c = linkColor(l)
                    return (
                      <g key={l}>
                        <path
                          d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
                          stroke={c} strokeWidth={2.5} fill="none"
                        />
                        <circle cx={x1} cy={y1} r={4} fill={c} />
                        <circle cx={x2} cy={y2} r={4} fill={c} />
                      </g>
                    )
                  })}
                </svg>
              )}

              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                <div style={{ width: colW || '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {quiz.left.map((text, i) => {
                    const ok = resolved && links[i] !== undefined
                      ? right[links[i]!]?.originalIndex === i
                      : undefined
                    const p = cellPalette(resolved, isSel('L', i), links[i] !== undefined, ok)
                    return (
                      <button
                        key={i}
                        ref={el => { leftRefs.current[i] = el }}
                        onClick={() => tap('L', i)}
                        disabled={resolved}
                        style={{ ...cellStyle(p), flexDirection: 'row', alignItems: 'center', gap: 8 }}
                      >
                        {ok !== undefined && (
                          <span style={{
                            width: 18, height: 18, borderRadius: 999, flexShrink: 0,
                            background: ok ? Q.correct : Q.wrong, color: Q.onSolid,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 700,
                          }}>{ok ? '✓' : '✗'}</span>
                        )}
                        <span style={{ fontFamily: T.sans, fontSize: 13.5, lineHeight: 1.42, color: p.text }}>{text}</span>
                      </button>
                    )
                  })}
                </div>

                <div style={{ width: CHANNEL, flexShrink: 0 }} />

                <div style={{ width: colW || '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {right.map((item, j) => {
                    const owner = leftOfRight(j)
                    const ok = resolved && owner !== undefined ? item.originalIndex === owner : undefined
                    const p = cellPalette(resolved, isSel('R', j), owner !== undefined, ok)
                    return (
                      <button
                        key={j}
                        ref={el => { rightRefs.current[j] = el }}
                        onClick={() => tap('R', j)}
                        disabled={resolved}
                        style={{ ...cellStyle(p), alignItems: 'flex-end' }}
                      >
                        <span style={{
                          fontFamily: T.sans, fontSize: 13.5, lineHeight: 1.42,
                          color: p.text, textAlign: 'right',
                        }}>{item.value}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {!resolved && allLinked && (
              <div style={{ marginTop: 18 }}>
                <PrimaryButton label="確認配對" onClick={confirm} arrow={false} />
              </div>
            )}
          </div>
        )
      }}
    </QuizFrame>
  )
}

function cellStyle(p: ReturnType<typeof cellPalette>): React.CSSProperties {
  return {
    minHeight: 48, padding: '10px 12px', width: '100%',
    display: 'flex', justifyContent: 'center',
    flexDirection: 'column',
    borderRadius: RADIUS.option,
    border: `1.5px solid ${p.border}`,
    background: p.bg,
    textAlign: 'left',
    transition: 'background 0.18s, border-color 0.18s',
  }
}

function cellPalette(resolved: boolean, selected: boolean, linked: boolean, correct?: boolean) {
  if (resolved && linked) {
    return correct
      ? { bg: Q.correctTint, border: Q.correct, text: T.ink }
      : { bg: Q.wrongTint, border: Q.wrong, text: T.ink }
  }
  if (selected) return { bg: Q.lift, border: T.accent, text: T.ink }
  if (linked) return { bg: T.card, border: T.accent, text: T.ink }
  return { bg: T.card, border: T.ruleSoft, text: T.ink }
}
