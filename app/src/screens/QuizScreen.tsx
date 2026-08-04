import { useEffect, useState } from 'react'
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native'
import { DotGrid } from '../components/DotGrid'
import { QuizCard } from '../components/QuizCard'
import { CompletionCard } from '../components/CompletionCard'
import { loadQuestions, type Quiz } from '../data'
import { fetchActivity, submitQuizAttempt } from '../api'
import { FONT, T, XP } from '../theme'

export function QuizScreen() {
  const [questions, setQuestions] = useState<Quiz[] | null>(null)
  const [index, setIndex] = useState(0)
  const [results, setResults] = useState<boolean[]>([])
  const [streak, setStreak] = useState(0)

  useEffect(() => {
    loadQuestions().then(setQuestions)
    // Best-effort: if this fails, streak just reads 0 instead of a stale/fake number.
    fetchActivity().then((a) => setStreak(a.streak)).catch(() => {})
  }, [])

  const total = questions?.length ?? 0
  const correctCount = results.filter(Boolean).length
  const xpToday = results.reduce((sum, ok) => sum + (ok ? XP.correct : XP.wrong), 0)
  const finished = index >= total

  const handleNext = (correct: boolean) => {
    const current = questions?.[index]
    if (current) {
      const quizId = Number(current.id)
      if (Number.isFinite(quizId)) submitQuizAttempt(quizId, correct)
    }
    setResults((prev) => [...prev, correct])
    setIndex((i) => i + 1)
  }

  const restart = () => {
    setResults([])
    setIndex(0)
    loadQuestions().then(setQuestions)
  }

  if (!questions) {
    return (
      <View style={[styles.loading, { backgroundColor: T.page }]}>
        <ActivityIndicator color={T.accent} />
      </View>
    )
  }

  return (
    <DotGrid>
      <SafeAreaView style={styles.flex}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>今日題目</Text>
        </View>
        {finished ? (
          <CompletionCard
            correctCount={correctCount}
            total={total}
            xpToday={xpToday}
            onRestart={restart}
          />
        ) : (
          <QuizCard
            key={questions[index]!.id}
            quiz={questions[index]!}
            index={index}
            total={total}
            streak={streak}
            xpToday={xpToday}
            isLast={index === total - 1}
            onNext={handleNext}
          />
        )}
      </SafeAreaView>
    </DotGrid>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center' },
  headerTitle: { fontFamily: FONT.bold, fontSize: 17, color: T.text },
})
