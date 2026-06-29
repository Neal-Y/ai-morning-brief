import { useRef, useState, type ReactNode } from 'react'
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native'
import { FONT, RADIUS, T, XP } from '../theme'
import { FadeInDown } from './Reveal'
import { PaperButton } from './PaperButton'

export interface AnswerAreaApi {
  resolved: boolean
  resolve: (correct: boolean) => void
}

interface Props {
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
  onNext: (correct: boolean) => void
  /** The type-specific interactive answer area. Calls `resolve(correct)` once committed. */
  children: (api: AnswerAreaApi) => ReactNode
}

/**
 * Shared chrome for every quiz type: progress bar, streak/XP, category pill,
 * prompt, source, the +XP fly animation, the feedback card, and the Next button.
 * Type-specific cards provide only the answer area via the `children` render prop
 * and signal completion with `resolve(correct)`.
 */
export function QuizFrame({
  id, category, prompt, explanation, source,
  index, total, streak, xpToday, isLast, onNext, children,
}: Props) {
  const [resolved, setResolved] = useState(false)
  const [correct, setCorrect] = useState(false)

  const fly = useRef(new Animated.Value(0)).current
  const flyStyle = {
    opacity: fly,
    transform: [{ translateY: fly.interpolate({ inputRange: [0, 1], outputRange: [0, -28] }) }],
  }

  const resolve = (isCorrect: boolean) => {
    if (resolved) return
    setResolved(true)
    setCorrect(isCorrect)
    if (isCorrect) {
      fly.setValue(0)
      Animated.sequence([
        Animated.timing(fly, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.timing(fly, { toValue: 0, duration: 780, useNativeDriver: true }),
      ]).start()
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <View style={styles.dashes}>
          {Array.from({ length: total }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.dash,
                { backgroundColor: i < index ? T.accent : i === index ? T.accentHi : T.track },
              ]}
            />
          ))}
        </View>
        <View style={styles.stats}>
          <Text style={styles.stat}>🔥 {streak}</Text>
          <View>
            <Text style={styles.stat}>⚡ {xpToday}</Text>
            <Animated.Text style={[styles.flyXp, flyStyle]}>+{XP.correct}</Animated.Text>
          </View>
        </View>
      </View>
      <Text style={styles.counter}>
        第 {index + 1} 題 · 共 {total} 題
      </Text>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <FadeInDown key={id} duration={450}>
          <View style={styles.pill}>
            <Text style={styles.pillText}>{category}</Text>
          </View>
          <Text style={styles.prompt}>{prompt}</Text>
          {source && (
            <View style={styles.sourceRow}>
              <View style={styles.sourceDot} />
              <Text style={styles.sourceText}>{source.name}</Text>
            </View>
          )}

          <View style={styles.answerArea}>{children({ resolved, resolve })}</View>

          {resolved && (
            <FadeInDown
              duration={350}
              delay={120}
              style={[styles.feedback, { backgroundColor: correct ? T.correctTint : T.wrongTint }]}
            >
              <View style={styles.feedbackHead}>
                <View style={[styles.feedbackMark, { backgroundColor: correct ? T.correct : T.wrong }]}>
                  <Text style={styles.feedbackMarkText}>{correct ? '✓' : '✗'}</Text>
                </View>
                <Text style={styles.feedbackTitle}>{correct ? '答對了！' : '答錯了'}</Text>
                <Text style={[styles.feedbackXp, { color: correct ? T.correct : T.wrong }]}>
                  +{correct ? XP.correct : XP.wrong} XP
                </Text>
              </View>
              <Text style={styles.explanation}>{explanation}</Text>
            </FadeInDown>
          )}
        </FadeInDown>
      </ScrollView>

      {resolved && (
        <FadeInDown duration={300} style={styles.footer}>
          <PaperButton label={isLast ? '完成今日' : '下一題'} onPress={() => onNext(correct)} />
        </FadeInDown>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    gap: 12,
  },
  dashes: { flex: 1, flexDirection: 'row', gap: 5 },
  dash: { flex: 1, height: 4, borderRadius: 999 },
  stats: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stat: { fontFamily: FONT.monoMed, fontSize: 13, color: T.text },
  flyXp: {
    position: 'absolute',
    right: 0,
    top: -2,
    fontFamily: FONT.monoBold,
    fontSize: 13,
    color: T.correct,
  },
  counter: {
    fontFamily: FONT.mono,
    fontSize: 11,
    color: T.textFaint,
    letterSpacing: 1,
    paddingHorizontal: 20,
    marginTop: 10,
    textTransform: 'uppercase',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: T.accentSoft,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 14,
  },
  pillText: { fontFamily: FONT.monoBold, fontSize: 11, letterSpacing: 1.2, color: T.accent },
  prompt: { fontFamily: FONT.black, fontSize: 25, lineHeight: 36, letterSpacing: -0.2, color: T.text },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 },
  sourceDot: { width: 6, height: 6, borderRadius: 999, backgroundColor: T.textFaint },
  sourceText: { fontFamily: FONT.mono, fontSize: 12, color: T.textMuted },
  answerArea: { marginTop: 20 },
  feedback: { marginTop: 16, borderRadius: RADIUS.card, padding: 16 },
  feedbackHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  feedbackMark: { width: 24, height: 24, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  feedbackMarkText: { color: '#FFFFFF', fontFamily: FONT.bold, fontSize: 14 },
  feedbackTitle: { flex: 1, fontFamily: FONT.black, fontSize: 16, color: T.text },
  feedbackXp: { fontFamily: FONT.monoBold, fontSize: 14 },
  explanation: { marginTop: 10, fontFamily: FONT.regular, fontSize: 14, lineHeight: 23, color: T.textMuted },
  footer: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
})
