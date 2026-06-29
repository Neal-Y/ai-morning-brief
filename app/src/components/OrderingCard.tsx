import { useEffect, useRef, useState } from 'react'
import { Animated, LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from 'react-native'
import type { OrderingQuiz } from '../data'
import { FONT, RADIUS, T } from '../theme'
import { QuizFrame, type AnswerAreaApi } from './QuizFrame'
import { PaperButton } from './PaperButton'

// LayoutAnimation needs an opt-in on Android; iOS has it on by default.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

interface Props {
  quiz: OrderingQuiz
  index: number
  total: number
  streak: number
  xpToday: number
  isLast: boolean
  onNext: (correct: boolean) => void
}

interface SlotItem {
  text: string
  originalIndex: number // its correct slot (0-based)
}

/** Fisher-Yates; re-shuffles once if it happens to equal the identity order. */
function shuffle(items: string[]): SlotItem[] {
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

type RowState = 'idle' | 'selected' | 'right' | 'wrong'

export function OrderingCard({ quiz, index, total, streak, xpToday, isLast, onNext }: Props) {
  const [arrangement, setArrangement] = useState<SlotItem[]>(() => shuffle(quiz.items))
  const [selected, setSelected] = useState<number | null>(null) // slot index currently lifted

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
        const tap = (i: number) => {
          if (resolved) return
          if (selected === null) {
            setSelected(i)
          } else if (selected === i) {
            setSelected(null) // tap again to cancel
          } else {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
            setArrangement((prev) => {
              const next = [...prev]
              ;[next[selected], next[i]] = [next[i]!, next[selected]!]
              return next
            })
            setSelected(null)
          }
        }

        const confirm = () => {
          if (resolved) return
          const correct = arrangement.every((it, pos) => it.originalIndex === pos)
          resolve(correct)
        }

        const rowState = (i: number): RowState => {
          if (resolved) return arrangement[i]!.originalIndex === i ? 'right' : 'wrong'
          return selected === i ? 'selected' : 'idle'
        }

        return (
          <View>
            <Text style={styles.hint}>點一個選項後再點另一個即可交換位置</Text>
            <View style={styles.list}>
              {arrangement.map((item, i) => (
                <SwapRow
                  key={item.originalIndex}
                  slot={i + 1}
                  text={item.text}
                  state={rowState(i)}
                  disabled={resolved}
                  onPress={() => tap(i)}
                />
              ))}
            </View>

            {!resolved && (
              <View style={styles.confirmWrap}>
                <PaperButton label="確認順序" onPress={confirm} arrow={false} />
              </View>
            )}
          </View>
        )
      }}
    </QuizFrame>
  )
}

function SwapRow({
  slot, text, state, disabled, onPress,
}: {
  slot: number
  text: string
  state: RowState
  disabled: boolean
  onPress: () => void
}) {
  const pulse = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (state === 'selected') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 620, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 620, useNativeDriver: true }),
        ]),
      )
      loop.start()
      return () => {
        loop.stop()
        pulse.setValue(0)
      }
    }
    return undefined
  }, [state, pulse])

  const pal = palette(state)
  const scale = state === 'selected'
    ? pulse.interpolate({ inputRange: [0, 1], outputRange: [1.02, 1.05] })
    : 1

  return (
    <Animated.View
      style={[
        state === 'selected' && styles.lifted,
        { transform: [{ scale }] },
      ]}
    >
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={[styles.row, { backgroundColor: pal.bg, borderColor: pal.border }]}
      >
        <View style={[styles.slot, { backgroundColor: pal.slotBg }]}>
          <Text style={[styles.slotText, { color: pal.slotText }]}>{slot}</Text>
        </View>
        <Text style={[styles.text, { color: pal.text }]}>{text}</Text>
        {state === 'selected' && <Text style={styles.grip}>⇅</Text>}
      </Pressable>
    </Animated.View>
  )
}

function palette(state: RowState) {
  switch (state) {
    case 'selected':
      // Neutral lift: a slightly elevated warm surface (not a red fill); the
      // shadow + thin ember ring do the "picked up" work. ember stays only on the slot.
      return { bg: '#2C2620', border: T.accent, slotBg: T.accent, slotText: '#FFFFFF', text: T.text }
    case 'right':
      return { bg: T.correctTint, border: T.correct, slotBg: T.correct, slotText: '#FFFFFF', text: T.text }
    case 'wrong':
      return { bg: T.wrongTint, border: T.wrong, slotBg: T.wrong, slotText: '#FFFFFF', text: T.text }
    default:
      return { bg: T.surface, border: T.border, slotBg: T.letterBg, slotText: T.letterText, text: T.text }
  }
}

const styles = StyleSheet.create({
  hint: { fontFamily: FONT.mono, fontSize: 12, color: T.textMuted, marginBottom: 12 },
  list: { gap: 10 },
  row: {
    minHeight: 56,
    borderRadius: RADIUS.option,
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  lifted: {
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
    zIndex: 2,
  },
  slot: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  slotText: { fontFamily: FONT.monoBold, fontSize: 14 },
  text: { flex: 1, fontFamily: FONT.medium, fontSize: 16, lineHeight: 22 },
  grip: { fontFamily: FONT.bold, fontSize: 18, color: T.accent },
  confirmWrap: { marginTop: 16 },
})
