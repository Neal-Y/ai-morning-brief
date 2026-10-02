import { getDeviceId } from './device'

export function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  headers.set('X-Device-Id', getDeviceId())
  return fetch(url, { ...init, headers })
}

function jsonInit(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

// ── quiz ─────────────────────────────────────────────────────────────────────

export interface RawQuizItem {
  id: number
  type: string
  category: string
  prompt: string
  payload: Record<string, unknown>
  explanation: string
  sourceName: string | null
  sourceUrl: string | null
  /** A previously missed question served again by the spaced-review schedule. */
  review?: boolean
}

/** Only the types this client can render. Widen as new interaction cards ship. */
const SUPPORTED_QUIZ_TYPES = 'single_choice,ordering,matching,fill_blank'

export async function fetchQuizzes(count = 5): Promise<RawQuizItem[]> {
  const res = await apiFetch(`/api/quiz?count=${count}&type=${SUPPORTED_QUIZ_TYPES}`)
  if (!res.ok) throw new Error(`fetchQuizzes failed: ${res.status}`)
  const data = await res.json() as { quizzes: RawQuizItem[] }
  return data.quizzes
}

/** Fire-and-forget: a failed attempt log must never block the quiz flow. */
export async function submitQuizAttempt(quizId: number, correct: boolean): Promise<void> {
  try {
    const res = await apiFetch('/api/quiz-attempt', jsonInit({ quizId, correct }))
    if (!res.ok) console.warn(`[api] submitQuizAttempt non-ok: ${res.status}`)
  } catch (err) {
    console.warn('[api] submitQuizAttempt failed:', err)
  }
}

// ── activity ─────────────────────────────────────────────────────────────────

export interface ActivityData {
  streak: number
  /** Whether today (Taipei) already counts toward the streak. */
  activeToday?: boolean
  totalCorrect: number
  /** All-time attempts (added 2026-09-30; absent from older cached copies). */
  totalAnswered?: number
  weekStats: { correct: number; wrong: number; total: number }
  heatmap: number[][]
  recent: { date: string; category: string; correct: number; total: number }[]
}

export async function fetchActivity(): Promise<ActivityData> {
  const res = await apiFetch('/api/activity')
  if (!res.ok) throw new Error(`fetchActivity failed: ${res.status}`)
  return res.json() as Promise<ActivityData>
}

// ── ask history ──────────────────────────────────────────────────────────────

export interface AskMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function fetchAskHistory(articleId: string): Promise<AskMessage[]> {
  try {
    const res = await apiFetch(`/api/ask-history?articleId=${encodeURIComponent(articleId)}`)
    if (!res.ok) return []
    const json = await res.json() as { messages?: AskMessage[] }
    return json.messages ?? []
  } catch {
    return []
  }
}

export async function saveAskHistory(articleId: string, messages: AskMessage[]): Promise<void> {
  try {
    await apiFetch('/api/ask-history', jsonInit({ articleId, messages }))
  } catch {
    // silent — history persistence must never block the user
  }
}

// ── quiz report ──────────────────────────────────────────────────────────────

export type QuizReportReason = 'wrong_answer' | 'unclear' | 'too_easy' | 'other'

export async function reportQuiz(quizId: number, reason: QuizReportReason): Promise<boolean> {
  try {
    const res = await apiFetch('/api/quiz-report', jsonInit({ quizId, reason }))
    return res.ok
  } catch {
    return false
  }
}

// ── weekly review ────────────────────────────────────────────────────────────

export interface WeeklyData {
  weekLabel: string
  daysElapsed: number
  activeDays: number
  read: number
  answered: number
  correct: number
  lastWeek: { answered: number; correct: number }
  weakCategories: { category: string; wrong: number; total: number }[]
  missed: {
    quizId: number
    category: string
    prompt: string
    /** Absent in older cached weekly reviews, or when a stored payload is unreadable. */
    question?: RawQuizItem
  }[]
  saved: { id: string; title: string }[]
}

export async function fetchWeekly(): Promise<WeeklyData> {
  const res = await apiFetch('/api/weekly')
  if (!res.ok) throw new Error(`fetchWeekly failed: ${res.status}`)
  return res.json() as Promise<WeeklyData>
}

// ── stale-while-revalidate cache ─────────────────────────────────────────────
// Pages that show per-device stats render the last known copy instantly and
// refresh in the background, so opening a tab never shows a blank spinner.

const CACHE_PREFIX = 'mb_cache_'

export function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    return raw ? JSON.parse(raw) as T : null
  } catch {
    return null
  }
}

export function writeCache(key: string, value: unknown): void {
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value)) } catch { /* quota */ }
}
