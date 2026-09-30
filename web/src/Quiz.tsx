import { useEffect, useState } from 'react'
import { THEME_DARK } from './theme.ts'
import { useNavInset } from './nav.ts'
import { fetchActivity, submitQuizAttempt } from './api.ts'
import { loadQuizzes, type Quiz as QuizItem } from './quiz/types.ts'
import { QuizCard } from './components/quiz/QuizCard.tsx'
import { CompletionCard } from './components/quiz/CompletionCard.tsx'
import { XP } from './components/quiz/tokens.ts'
import { getTaipeiDateString } from './date.ts'

const T = THEME_DARK

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; quizzes: QuizItem[] }

// Today's set + progress survive leaving the tab (Quiz unmounts on every tab
// switch) and iOS killing the standalone PWA. Without this, coming back
// refetched /api/quiz, which serves unattempted questions first — so question
// 3 came back as "1/5" with two new questions appended and XP reset to zero.
const SESSION_KEY = 'mb_quiz_session'

interface QuizSession {
  date: string
  quizzes: QuizItem[]
  index: number
  results: boolean[]
}

function readSession(): QuizSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as QuizSession
    if (s.date !== getTaipeiDateString() || !Array.isArray(s.quizzes) || s.quizzes.length === 0) return null
    if (!Number.isInteger(s.index) || s.index < 0 || !Array.isArray(s.results)) return null
    return s
  } catch {
    return null
  }
}

function writeSession(s: QuizSession) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)) } catch { /* private mode / quota */ }
}

export default function Quiz() {
  const navInset = useNavInset()
  const [restored] = useState(readSession)
  const [state, setState] = useState<LoadState>(() =>
    restored ? { status: 'ready', quizzes: restored.quizzes } : { status: 'loading' })
  const [index, setIndex] = useState(() => restored?.index ?? 0)
  const [results, setResults] = useState<boolean[]>(() => restored?.results ?? [])
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
    if (!restored) load()
    // Real streak from /api/activity — never a hardcoded constant. If the call
    // fails it reads 0 rather than showing a number that isn't true.
    fetchActivity().then(a => setStreak(a.streak)).catch(() => {})
  }, [])

  useEffect(() => {
    if (state.status === 'ready') {
      writeSession({ date: getTaipeiDateString(), quizzes: state.quizzes, index, results })
    }
  }, [state, index, results])

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
                fontFamily: T.mono, fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
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
