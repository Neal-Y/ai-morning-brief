import { useEffect, useState } from 'react'
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { StatusBar } from 'expo-status-bar'
import {
  useFonts,
  NotoSansTC_400Regular,
  NotoSansTC_500Medium,
  NotoSansTC_700Bold,
  NotoSansTC_900Black,
} from '@expo-google-fonts/noto-sans-tc'
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono'
import { DotGrid } from './src/components/DotGrid'
import { QuizCard } from './src/components/QuizCard'
import { CompletionCard } from './src/components/CompletionCard'
import { loadQuestions, type Quiz } from './src/data'
import { submitQuizAttempt } from './src/api'
import { FONT, T, XP } from './src/theme'

// Fixed for M1 (feel test). Real streak comes from backend later.
const STREAK = 12

export default function App() {
  const [fontsLoaded] = useFonts({
    NotoSansTC_400Regular,
    NotoSansTC_500Medium,
    NotoSansTC_700Bold,
    NotoSansTC_900Black,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  })

  const [questions, setQuestions] = useState<Quiz[] | null>(null)
  const [index, setIndex] = useState(0)
  const [results, setResults] = useState<boolean[]>([]) // correct? per answered question

  useEffect(() => {
    loadQuestions().then(setQuestions)
  }, [])

  const total = questions?.length ?? 0
  const correctCount = results.filter(Boolean).length
  const xpToday = results.reduce((sum, ok) => sum + (ok ? XP.correct : XP.wrong), 0)
  const finished = index >= total

  const handleNext = (correct: boolean) => {
    const current = questions?.[index]
    if (current) {
      const quizId = Number(current.id)
      // Hardcoded fallback questions have non-numeric ids ('q1'...) — only log
      // attempts for real API-backed quizzes.
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

  if (!fontsLoaded || !questions) {
    return (
      <View style={[styles.loading, { backgroundColor: T.page }]}>
        <ActivityIndicator color={T.accent} />
      </View>
    )
  }

  return (
    <GestureHandlerRootView style={styles.flex}>
      <StatusBar style="light" />
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
              key={questions[index].id}
              quiz={questions[index]}
              index={index}
              total={total}
              streak={STREAK}
              xpToday={xpToday}
              isLast={index === total - 1}
              onNext={handleNext}
            />
          )}
        </SafeAreaView>
      </DotGrid>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
  },
  headerTitle: { fontFamily: FONT.bold, fontSize: 17, color: T.text },
})
