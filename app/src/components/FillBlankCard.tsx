import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { FillBlankQuiz } from '../data'
import { FONT, RADIUS, T } from '../theme'
import { QuizFrame, type AnswerAreaApi } from './QuizFrame'
import { PaperButton } from './PaperButton'

interface Props {
  quiz: FillBlankQuiz
  index: number
  total: number
  streak: number
  xpToday: number
  isLast: boolean
  onNext: (correct: boolean) => void
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

// Tokenize so a flexWrap row wraps naturally: keep English words/numbers intact,
// break CJK per character, preserve spaces.
function tokenize(text: string): string[] {
  const re = /[A-Za-z0-9]+|\s+|[^A-Za-z0-9\s]/g
  return text.match(re) ?? []
}

export function FillBlankCard({ quiz, index, total, streak, xpToday, isLast, onNext }: Props) {
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
      index={index}
      total={total}
      streak={streak}
      xpToday={xpToday}
      isLast={isLast}
      onNext={onNext}
    >
      {({ resolved, resolve }: AnswerAreaApi) => {
        const usedWords = new Set(filled.filter((w): w is number => w !== null))
        const allFilled = filled.every((w) => w !== null)

        const tapBlank = (b: number) => {
          if (resolved) return
          if (filled[b] !== null) {
            setFilled((prev) => prev.map((w, i) => (i === b ? null : w)))
            setActiveBlank(b)
            return
          }
          setActiveBlank((cur) => (cur === b ? null : b))
        }

        const tapWord = (w: number) => {
          if (resolved || usedWords.has(w)) return
          const target = activeBlank ?? filled.findIndex((x) => x === null)
          if (target === -1) return
          setFilled((prev) => prev.map((x, i) => (i === target ? w : x)))
          setActiveBlank(null)
        }

        const confirm = () => {
          if (resolved || !allFilled) return
          const correct = quiz.blanks.every((ans, b) => quiz.wordBank[filled[b]!] === ans)
          resolve(correct)
        }

        const blankCorrect = (b: number): boolean => quiz.wordBank[filled[b]!] === quiz.blanks[b]

        return (
          <View>
            {/* Sentence with inline blanks */}
            <View style={styles.flow}>
              {segments.map((seg, si) => {
                if (seg.kind === 'text') {
                  return tokenize(seg.value).map((tok, ti) => (
                    <Text key={`t${si}-${ti}`} style={styles.sentence}>
                      {tok}
                    </Text>
                  ))
                }
                const b = seg.index
                const w = filled[b]
                const active = activeBlank === b
                const pal = blankPalette(resolved, active, w !== null, resolved && w !== null ? blankCorrect(b) : undefined)
                return (
                  <Pressable
                    key={`b${si}`}
                    disabled={resolved}
                    onPress={() => tapBlank(b)}
                    style={[styles.blank, { backgroundColor: pal.bg, borderColor: pal.border, borderStyle: w === null ? 'dashed' : 'solid' }]}
                  >
                    <Text style={[styles.blankText, { color: w === null ? T.textFaint : pal.text }]}>
                      {w === null ? '＿＿' : quiz.wordBank[w]}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            {/* Word bank */}
            <View style={styles.bank}>
              {quiz.wordBank.map((word, w) => {
                const used = usedWords.has(w)
                return (
                  <Pressable
                    key={w}
                    disabled={resolved || used}
                    onPress={() => tapWord(w)}
                    style={[styles.chip, used && styles.chipUsed]}
                  >
                    <Text style={[styles.chipText, used && styles.chipTextUsed]}>{word}</Text>
                  </Pressable>
                )
              })}
            </View>

            {!resolved && allFilled && (
              <View style={styles.confirmWrap}>
                <PaperButton label="確認填空" onPress={confirm} arrow={false} />
              </View>
            )}
          </View>
        )
      }}
    </QuizFrame>
  )
}

function blankPalette(resolved: boolean, active: boolean, filled: boolean, correct?: boolean) {
  if (resolved && filled) {
    // Solid semantic fill so the result pops out of the surrounding sentence —
    // a thin border alone was too easy to miss inline.
    return correct
      ? { bg: T.correct, border: T.correct, text: T.page }
      : { bg: T.wrong, border: T.wrong, text: T.page }
  }
  if (active) return { bg: '#2C2620', border: T.accent, text: T.text }
  if (filled) return { bg: T.surface, border: T.accent, text: T.text }
  return { bg: 'transparent', border: T.textFaint, text: T.textFaint }
}

const styles = StyleSheet.create({
  flow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  sentence: { fontFamily: FONT.medium, fontSize: 17, lineHeight: 36, color: T.text },
  blank: {
    minWidth: 54,
    height: 30, // fixed, <= line box, so inline pills don't push lines apart
    borderRadius: 8,
    borderWidth: 1.5,
    paddingHorizontal: 10,
    marginHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blankText: { fontFamily: FONT.bold, fontSize: 15 },
  bank: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 24 },
  chip: {
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
    borderColor: T.border,
    backgroundColor: T.surface,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  chipUsed: { opacity: 0.32 },
  chipText: { fontFamily: FONT.medium, fontSize: 15, color: T.text },
  chipTextUsed: { color: T.textMuted },
  confirmWrap: { marginTop: 24 },
})
