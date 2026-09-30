import { getTaipeiDateString } from '../date.ts'
import { loadQuizzes, type Quiz } from './types.ts'

// Today's quiz set + progress, persisted so it survives leaving the tab (Quiz
// unmounts on every tab switch) and iOS killing the standalone PWA. Without it,
// coming back refetched /api/quiz, which serves unattempted questions first —
// question 3 came back as "1/5" with new questions appended (Issue 19).

const SESSION_KEY = 'mb_quiz_session'

export interface QuizSession {
  date: string
  quizzes: Quiz[]
  index: number
  results: (boolean | null)[] // null = skipped after a report
}

export function readQuizSession(): QuizSession | null {
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

export function writeQuizSession(s: QuizSession): void {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)) } catch { /* private mode / quota */ }
}

// One in-flight fetch of today's set, shared by the Feed's background prefetch
// and the Quiz tab, so opening Quiz mid-prefetch waits on it instead of firing
// a second request (which could come back with a different set).
let inflight: { date: string; promise: Promise<Quiz[]> } | null = null

export function loadTodaysQuizzes(): Promise<Quiz[]> {
  const date = getTaipeiDateString()
  if (inflight?.date === date) return inflight.promise
  const promise = loadQuizzes()
  inflight = { date, promise }
  promise.catch(() => { if (inflight?.promise === promise) inflight = null })
  return promise
}

/**
 * Called by the Feed once the brief is on screen: fetch today's quiz set in the
 * background so the Quiz tab opens instantly. Never overwrites an existing
 * session — the user may already be mid-quiz.
 */
export function prefetchTodaysQuiz(): void {
  if (readQuizSession()) return
  loadTodaysQuizzes()
    .then(quizzes => {
      if (quizzes.length === 0 || readQuizSession()) return
      writeQuizSession({ date: getTaipeiDateString(), quizzes, index: 0, results: [] })
    })
    .catch(() => { /* the Quiz tab will fetch (and show its own error) */ })
}
