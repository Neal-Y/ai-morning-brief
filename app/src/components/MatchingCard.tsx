import { useState } from 'react'
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import type { MatchingQuiz } from '../data'
import { FONT, RADIUS, T } from '../theme'
import { QuizFrame, type AnswerAreaApi } from './QuizFrame'
import { PaperButton } from './PaperButton'

// A real center channel gives the connector curves horizontal room to bow,
// so even a top-left → bottom-right link reads as a graceful S, not a steep slash.
const CHANNEL = 54

type Side = 'L' | 'R'

interface Props {
  quiz: MatchingQuiz
  index: number
  total: number
  streak: number
  xpToday: number
  isLast: boolean
  onNext: (correct: boolean) => void
}

interface RightItem {
  text: string
  originalIndex: number // index of the LEFT item it correctly matches
}

function shuffle(items: string[]): RightItem[] {
  const withIndex = items.map((text, originalIndex) => ({ text, originalIndex }))
  for (let attempt = 0; attempt < 5; attempt++) {
    const arr = [...withIndex]
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
    }
    if (arr.some((it, pos) => it.originalIndex !== pos)) return arr
  }
  return withIndex
}

export function MatchingCard({ quiz, index, total, streak, xpToday, isLast, onNext }: Props) {
  const [right] = useState<RightItem[]>(() => shuffle(quiz.right))
  const [selected, setSelected] = useState<{ side: Side; index: number } | null>(null)
  const [links, setLinks] = useState<Record<number, number>>({}) // leftIndex -> rightDisplayIndex

  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [leftY, setLeftY] = useState<Record<number, number>>({})
  const [rightY, setRightY] = useState<Record<number, number>>({})

  return (
    <QuizFrame
      id={quiz.id}
      category={quiz.category}
      prompt={quiz.prompt}
      explanation={quiz.explanation}
      source={quiz.source}
      index={index}
      total={total}
      streak={streak}
      xpToday={xpToday}
      isLast={isLast}
      onNext={onNext}
    >
      {({ resolved, resolve }: AnswerAreaApi) => {
        const leftOfRight = (r: number): number | undefined =>
          Object.keys(links).map(Number).find((l) => links[l] === r)
        const isLinked = (side: Side, i: number) =>
          side === 'L' ? links[i] !== undefined : leftOfRight(i) !== undefined

        const tap = (side: Side, i: number) => {
          if (resolved) return
          if (isLinked(side, i)) {
            const l = side === 'L' ? i : leftOfRight(i)!
            setLinks((prev) => {
              const next = { ...prev }
              delete next[l]
              return next
            })
            setSelected(null)
            return
          }
          if (!selected) {
            setSelected({ side, index: i })
            return
          }
          if (selected.side === side) {
            setSelected(selected.index === i ? null : { side, index: i })
            return
          }
          const l = side === 'L' ? i : selected.index
          const r = side === 'R' ? i : selected.index
          setLinks((prev) => ({ ...prev, [l]: r }))
          setSelected(null)
        }

        const allLinked = Object.keys(links).length === quiz.left.length
        const confirm = () => {
          if (resolved || !allLinked) return
          const correct = quiz.left.every((_, i) => {
            const r = links[i]
            return r !== undefined && right[r]!.originalIndex === i
          })
          resolve(correct)
        }

        const colW = size.w > 0 ? (size.w - CHANNEL) / 2 : 0
        const x1 = colW
        const x2 = colW + CHANNEL
        const dx = CHANNEL * 0.55

        const linkColor = (l: number): string => {
          if (!resolved) return T.accent
          const r = links[l]
          return r !== undefined && right[r]!.originalIndex === l ? T.correct : T.wrong
        }

        const isSel = (side: Side, i: number) => selected?.side === side && selected.index === i

        return (
          <View>
            <Text style={styles.hint}>點兩邊各一項即可配對（再點一次可取消）</Text>

            <View
              style={styles.board}
              onLayout={(e: LayoutChangeEvent) => {
                const { width, height } = e.nativeEvent.layout
                if (width !== size.w || height !== size.h) setSize({ w: width, h: height })
              }}
            >
              {size.w > 0 && (
                <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill} pointerEvents="none">
                  {Object.keys(links).map(Number).map((l) => {
                    const r = links[l]!
                    const y1 = leftY[l]
                    const y2 = rightY[r]
                    if (y1 === undefined || y2 === undefined) return null
                    const color = linkColor(l)
                    return (
                      <Path
                        key={`p${l}`}
                        d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
                        stroke={color}
                        strokeWidth={2.5}
                        fill="none"
                      />
                    )
                  })}
                  {/* endpoint dots */}
                  {Object.keys(links).map(Number).flatMap((l) => {
                    const r = links[l]!
                    const y1 = leftY[l]
                    const y2 = rightY[r]
                    if (y1 === undefined || y2 === undefined) return []
                    const color = linkColor(l)
                    return [
                      <Circle key={`dl${l}`} cx={x1} cy={y1} r={4} fill={color} />,
                      <Circle key={`dr${l}`} cx={x2} cy={y2} r={4} fill={color} />,
                    ]
                  })}
                </Svg>
              )}

              <View style={styles.columns}>
                <View style={[styles.col, { width: colW }]}>
                  {quiz.left.map((text, i) => {
                    const leftCorrect =
                      resolved && links[i] !== undefined ? right[links[i]!]?.originalIndex === i : undefined
                    const pal = cellPalette(resolved, isSel('L', i), links[i] !== undefined, leftCorrect)
                    return (
                      <Pressable
                        key={i}
                        disabled={resolved}
                        onPress={() => tap('L', i)}
                        onLayout={(e) => {
                          const c = e.nativeEvent.layout.y + e.nativeEvent.layout.height / 2
                          if (leftY[i] !== c) setLeftY((p) => ({ ...p, [i]: c }))
                        }}
                        style={[styles.cell, styles.cellL, { backgroundColor: pal.bg, borderColor: pal.border }]}
                      >
                        {leftCorrect !== undefined && (
                          <View style={[styles.mark, { backgroundColor: leftCorrect ? T.correct : T.wrong }]}>
                            <Text style={styles.markText}>{leftCorrect ? '✓' : '✗'}</Text>
                          </View>
                        )}
                        <Text style={[styles.cellText, { color: pal.text }]}>{text}</Text>
                      </Pressable>
                    )
                  })}
                </View>

                <View style={{ width: CHANNEL }} />

                <View style={[styles.col, { width: colW }]}>
                  {right.map((item, j) => {
                    const owner = leftOfRight(j)
                    const pal = cellPalette(resolved, isSel('R', j), owner !== undefined,
                      resolved && owner !== undefined ? item.originalIndex === owner : undefined)
                    return (
                      <Pressable
                        key={j}
                        disabled={resolved}
                        onPress={() => tap('R', j)}
                        onLayout={(e) => {
                          const c = e.nativeEvent.layout.y + e.nativeEvent.layout.height / 2
                          if (rightY[j] !== c) setRightY((p) => ({ ...p, [j]: c }))
                        }}
                        style={[styles.cell, styles.cellR, { backgroundColor: pal.bg, borderColor: pal.border }]}
                      >
                        <Text style={[styles.cellText, { color: pal.text }]}>{item.text}</Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>
            </View>

            {!resolved && allLinked && (
              <View style={styles.confirmWrap}>
                <PaperButton label="確認配對" onPress={confirm} arrow={false} />
              </View>
            )}
          </View>
        )
      }}
    </QuizFrame>
  )
}

function cellPalette(resolved: boolean, selected: boolean, linked: boolean, correct?: boolean) {
  if (resolved && linked) {
    return correct
      ? { bg: T.correctTint, border: T.correct, text: T.text }
      : { bg: T.wrongTint, border: T.wrong, text: T.text }
  }
  if (selected) return { bg: '#2C2620', border: T.accent, text: T.text }
  if (linked) return { bg: T.surface, border: T.accent, text: T.text }
  return { bg: T.surface, border: T.border, text: T.text }
}

const styles = StyleSheet.create({
  hint: { fontFamily: FONT.mono, fontSize: 12, color: T.textMuted, marginBottom: 14 },
  board: { position: 'relative' },
  columns: { flexDirection: 'row', alignItems: 'flex-start' },
  col: { gap: 12 },
  cell: {
    minHeight: 50,
    borderRadius: RADIUS.option,
    borderWidth: 1.5,
    paddingVertical: 10,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  cellL: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cellR: { alignItems: 'flex-end' },
  cellText: { fontFamily: FONT.medium, fontSize: 14, lineHeight: 20 },
  mark: { width: 20, height: 20, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  markText: { color: '#FFFFFF', fontFamily: FONT.bold, fontSize: 12 },
  confirmWrap: { marginTop: 18 },
})
