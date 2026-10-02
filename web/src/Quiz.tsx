import { useEffect, useState } from 'react'
import { THEME_DARK } from './theme.ts'
import { useNavInset } from './nav.ts'
import { fetchActivity, readCache, submitQuizAttempt, writeCache, type ActivityData } from './api.ts'
import { loadQuizzes, type Quiz as QuizItem } from './quiz/types.ts'
import { loadTodaysQuizzes, readQuizSession, writeQuizSession } from './quiz/session.ts'
import { QuizCard } from './components/quiz/QuizCard.tsx'
import { CompletionCard } from './components/quiz/CompletionCard.tsx'
import { XP } from './components/quiz/tokens.ts'
import { getTaipeiDateString } from './date.ts'

const T = THEME_DARK

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; quizzes: QuizItem[] }

export default function Quiz() {
  const navInset = useNavInset()
  const [restored] = useState(readQuizSession)
  const [state, setState] = useState<LoadState>(() =>
    restored ? { status: 'ready', quizzes: restored.quizzes } : { status: 'loading' })
  // results.length can be index + 1: the current question was answered but
  // 「下一題」 wasn't tapped before leaving. Resume after it — it's recorded.
  const [index, setIndex] = useState(() => restored ? Math.max(restored.index, restored.results.length) : 0)
  const [results, setResults] = useState<(boolean | null)[]>(() => restored?.results ?? [])
  // Last known streak renders instantly; /api/activity refreshes it.
  const [streak, setStreak] = useState(() => readCache<ActivityData>('activity')?.streak ?? 0)

  // `fresh`: CompletionCard's "another set" wants a new set, not today's
  // (possibly prefetched) one.
  const load = (fresh = false) => {
    setState({ status: 'loading' })
    setResults([])
    setIndex(0)
    ;(fresh ? loadQuizzes() : loadTodaysQuizzes())
      .then(quizzes => setState(quizzes.length > 0
        ? { status: 'ready', quizzes }
        : { status: 'error' }))
      .catch(() => setState({ status: 'error' }))
  }

  useEffect(() => {
    if (!restored) load()
    // Real streak from /api/activity — never a hardcoded constant. If the call
    // fails it reads 0 rather than showing a number that isn't true.
    fetchActivity().then(a => { setStreak(a.streak); writeCache('activity', a) }).catch(() => {})
  }, [])

  useEffect(() => {
    if (state.status === 'ready') {
      writeQuizSession({ date: getTaipeiDateString(), quizzes: state.quizzes, index, results })
    }
  }, [state, index, results])

  const quizzes = state.status === 'ready' ? state.quizzes : []
  const total = quizzes.length
  const correctCount = results.filter(r => r === true).length
  const answeredCount = results.filter(r => r !== null).length
  const xpToday = results.reduce((sum, ok) => sum + (ok === null ? 0 : ok ? XP.correct : XP.wrong), 0)
  const finished = total > 0 && index >= total

  // The attempt is recorded the moment the question is answered, not on
  // 「下一題」: leaving mid-explanation (to check an article, or iOS killing the
  // PWA) used to drop the attempt and hand back the same question — with the
  // answer already seen.
  const handleResolve = (correct: boolean) => {
    if (results.length > index) return // already recorded for this question
    const current = quizzes[index]
    if (current) {
      const quizId = Number(current.id)
      if (Number.isFinite(quizId)) void submitQuizAttempt(quizId, correct)
    }
    setResults(prev => [...prev, correct])
  }

  const handleNext = () => setIndex(i => i + 1)

  // A reported question can be left without answering: no attempt is recorded
  // (it would count as a miss and feed the review schedule), and the slot is
  // kept as null so results stays aligned with index.
  const handleSkip = () => {
    if (results.length > index) { handleNext(); return }
    setResults(prev => [...prev, null])
    handleNext()
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
              onClick={() => load()}
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
              total={answeredCount}
              xpToday={xpToday}
              missed={quizzes.filter((_, i) => results[i] === false)}
              bottomInset={navInset}
              onRestart={() => load(true)}
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
              onResolve={handleResolve}
              onNext={handleNext}
              onSkip={handleSkip}
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
