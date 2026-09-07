import { useEffect, useState } from 'react'
import { THEME_DARK } from './theme.ts'
import { useNavInset } from './nav.ts'
import { fetchActivity, submitQuizAttempt } from './api.ts'
import { loadQuizzes, type Quiz as QuizItem } from './quiz/types.ts'
import { QuizCard } from './components/quiz/QuizCard.tsx'
import { CompletionCard } from './components/quiz/CompletionCard.tsx'
import { XP } from './components/quiz/tokens.ts'

const T = THEME_DARK

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; quizzes: QuizItem[] }

export default function Quiz() {
  const navInset = useNavInset()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [index, setIndex] = useState(0)
  const [results, setResults] = useState<boolean[]>([])
  const [streak, setStreak] = useState(0)

  const load = () => {
    setState({ status: 'loading' })
    setResults([])
    setIndex(0)
    loadQuizzes()
      .then(quizzes => setState(quizzes.length > 0
        ? { status: 'ready', quizzes }
        : { status: 'error' }))
      .catch(() => setState({ status: 'error' }))
  }

  useEffect(() => {
    load()
    // Real streak from /api/activity — never a hardcoded constant. If the call
    // fails it reads 0 rather than showing a number that isn't true.
    fetchActivity().then(a => setStreak(a.streak)).catch(() => {})
  }, [])

  const quizzes = state.status === 'ready' ? state.quizzes : []
  const total = quizzes.length
  const correctCount = results.filter(Boolean).length
  const xpToday = results.reduce((sum, ok) => sum + (ok ? XP.correct : XP.wrong), 0)
  const finished = total > 0 && index >= total

  const handleNext = (correct: boolean) => {
    const current = quizzes[index]
    if (current) {
      const quizId = Number(current.id)
      if (Number.isFinite(quizId)) void submitQuizAttempt(quizId, correct)
    }
    setResults(prev => [...prev, correct])
    setIndex(i => i + 1)
  }

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, height: '100%',
      background: T.bg, color: T.ink, fontFamily: T.sans,
      display: 'flex', justifyContent: 'center',
    }}>
      <div style={{
        width: '100%', maxWidth: 480, height: '100%',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {state.status === 'loading' && <Centered inset={navInset}>載入今日題目…</Centered>}

        {state.status === 'error' && (
          <Centered inset={navInset}>
            <div style={{ marginBottom: 14 }}>目前沒有可作答的題目</div>
            <button
              onClick={load}
              style={{
                fontFamily: T.mono, fontSize: 11, fontWeight: 700, letterSpacing: 1,
                color: T.bg, background: T.accent, border: 'none',
                borderRadius: 8, padding: '9px 22px', textTransform: 'uppercase',
              }}
            >重試</button>
          </Centered>
        )}

        {state.status === 'ready' && (
          finished ? (
            <CompletionCard
              correctCount={correctCount}
              total={total}
              xpToday={xpToday}
              bottomInset={navInset}
              onRestart={load}
            />
          ) : (
            <QuizCard
              key={quizzes[index]!.id}
              quiz={quizzes[index]!}
              index={index}
              total={total}
              streak={streak}
              xpToday={xpToday}
              isLast={index === total - 1}
              bottomInset={navInset}
              onNext={handleNext}
            />
          )
        )}
      </div>
    </div>
  )
}

function Centered({ children, inset }: { children: React.ReactNode; inset: number }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', paddingBottom: inset,
      fontFamily: T.mono, fontSize: 12, color: T.inkFaint, letterSpacing: 0.5,
    }}>{children}</div>
  )
}
