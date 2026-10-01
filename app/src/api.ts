import AsyncStorage from '@react-native-async-storage/async-storage'
import { fetch as expoFetch } from 'expo/fetch'
import { getDeviceId } from './device'

const PROD_BASE = 'https://ai-morning-brief-chi.vercel.app'
/**
 * API base URL: EXPO_PUBLIC_API_BASE_URL (app/.env) if set, else production.
 *
 * Every endpoint is a Vercel Edge function since 2026-10-01 — there is no local
 * API server to auto-detect any more (the old Hono dev server on :3001 is gone).
 */
function resolveApiBase(): string {
  return process.env.EXPO_PUBLIC_API_BASE_URL || PROD_BASE
}

const API_BASE = resolveApiBase()

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const deviceId = await getDeviceId()
  const headers = new Headers(init?.headers)
  headers.set('X-Device-Id', deviceId)
  return fetch(`${API_BASE}${path}`, { ...init, headers })
}

export async function fetchFeed(date: string): Promise<import('./types').Article[]> {
  const res = await apiFetch(`/api/feed?date=${date}`)
  if (!res.ok) throw new Error(`fetchFeed failed: ${res.status}`)
  const json = await res.json() as import('./types').FeedResponse
  return json.articles.map((a) => ({
    ...a,
    skillTags: typeof a.skillTags === 'string'
      ? (a.skillTags ? a.skillTags.split(',').map((s) => s.trim()) : [])
      : [],
  }))
}

export interface LibraryArticle {
  id: string
  url: string
  title: string
  summary: string
  context: string
  engineeringImpact: string
  reason: string
  shortJudgment: string | null
  categoryTag: string
  skillTags: string
  renderLevel: 'FULL' | 'LIGHT' | 'OMIT'
  score: number
  source: string | null
  briefDate: string
  feedback: 'up' | 'down' | null
  saved: boolean
  notionSynced: boolean
}

export async function fetchLibrary(): Promise<LibraryArticle[]> {
  const res = await apiFetch('/api/library')
  if (!res.ok) throw new Error(`fetchLibrary failed: ${res.status}`)
  const json = await res.json() as { articles: LibraryArticle[] }
  return json.articles
}

export async function unsaveArticle(articleId: string): Promise<void> {
  await apiFetch('/api/unsave', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ articleId }),
  })
}

export async function postFeedback(articleId: string, value: 1 | -1): Promise<void> {
  await apiFetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ articleId, signal: value === 1 ? 'up' : 'down' }),
  })
}

export async function saveArticle(articleId: string): Promise<void> {
  await apiFetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ articleId }),
  })
}

export interface RawQuizItem {
  id: number
  type: string
  category: string
  prompt: string
  payload: Record<string, unknown>
  explanation: string
  sourceName: string | null
  sourceUrl: string | null
}

// Only the quiz types the app can currently render. Add to this as new
// interaction components ship (matching, fill_blank).
const SUPPORTED_TYPES = 'single_choice,ordering,matching,fill_blank'

export async function fetchQuizzes(count = 5): Promise<RawQuizItem[]> {
  const res = await apiFetch(`/api/quiz?count=${count}&type=${SUPPORTED_TYPES}`)
  if (!res.ok) throw new Error(`fetchQuizzes failed: ${res.status}`)
  const data = (await res.json()) as { quizzes: RawQuizItem[] }
  return data.quizzes
}

export interface ActivityData {
  streak: number
  totalCorrect: number
  weekStats: { correct: number; wrong: number; total: number }
  heatmap: number[][]
  recent: { date: string; category: string; correct: number; total: number }[]
}

export async function fetchActivity(): Promise<ActivityData> {
  const res = await apiFetch('/api/activity')
  if (!res.ok) throw new Error(`fetchActivity failed: ${res.status}`)
  return res.json() as Promise<ActivityData>
}

export interface AskMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AskContext {
  title: string
  summary: string
  context: string
}

/**
 * Stream a follow-up answer from /api/ask (Haiku SSE). Uses expo/fetch because
 * RN's global fetch can't read a streaming response body — expo/fetch exposes
 * response.body as a ReadableStream. `onDelta` fires per text chunk.
 */
export async function streamAsk(
  ctx: AskContext,
  messages: AskMessage[],
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const deviceId = await getDeviceId()
  // /api/ask is an Edge function — it only exists on Vercel, never on the local
  // Hono dev server. Always hit prod (in a production build API_BASE === PROD_BASE).
  const res = await expoFetch(`${PROD_BASE}/api/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Id': deviceId },
    body: JSON.stringify({
      articleTitle: ctx.title,
      articleSummary: ctx.summary,
      articleContext: ctx.context,
      messages,
    }),
    signal,
  })
  if (!res.ok || !res.body) throw new Error(`ask failed: ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6)
      if (raw === '[DONE]') continue
      try {
        onDelta(JSON.parse(raw) as string)
      } catch {
        // skip malformed chunk
      }
    }
  }
}

// Quiz follow-ups (synthetic articleId `quiz-<id>`) cannot use /api/ask-history:
// the endpoint only accepts 16-hex article ids, and conversations.article_id has
// an enforced FK to articles.id. Same fix as web/src/askHistory.ts — quiz threads
// live on the device (AsyncStorage). Reach is equivalent: the DB rows would be
// scoped to a device id that is itself just an AsyncStorage UUID.
const QUIZ_THREAD_PREFIX = 'quiz-'
const QUIZ_ASK_KEY_PREFIX = 'sift_quiz_ask_'

function isQuizThread(articleId: string): boolean {
  return articleId.startsWith(QUIZ_THREAD_PREFIX)
}

function isAskMessage(m: unknown): m is AskMessage {
  if (!m || typeof m !== 'object') return false
  const { role, content } = m as { role?: unknown; content?: unknown }
  return (role === 'user' || role === 'assistant') && typeof content === 'string'
}

async function loadLocalAskHistory(articleId: string): Promise<AskMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(QUIZ_ASK_KEY_PREFIX + articleId)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter(isAskMessage) : []
  } catch {
    return []
  }
}

export async function fetchAskHistory(articleId: string): Promise<AskMessage[]> {
  if (isQuizThread(articleId)) return loadLocalAskHistory(articleId)
  try {
    const res = await apiFetch(`/api/ask-history?articleId=${encodeURIComponent(articleId)}`)
    if (!res.ok) return []
    const json = await res.json() as { messages: AskMessage[]; messageCount: number }
    return json.messages ?? []
  } catch {
    return []
  }
}

export async function saveAskHistory(articleId: string, messages: AskMessage[]): Promise<void> {
  if (messages.length === 0) return
  if (isQuizThread(articleId)) {
    try {
      await AsyncStorage.setItem(QUIZ_ASK_KEY_PREFIX + articleId, JSON.stringify(messages))
    } catch (err) {
      console.warn('[api] saveAskHistory (local) failed:', err)
    }
    return
  }
  try {
    const res = await apiFetch('/api/ask-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleId, messages, messageCount: messages.length }),
    })
    // Still never blocks the user, but a rejected save is no longer invisible —
    // an empty catch is exactly how the quiz-history 400s went unnoticed.
    if (!res.ok) console.warn(`[api] saveAskHistory non-ok status: ${res.status}`)
  } catch (err) {
    console.warn('[api] saveAskHistory failed:', err)
  }
}

/** Fire-and-forget — a failed attempt log must never block the quiz flow.
 *  Always hits prod: /api/quiz-attempt is a Vercel Edge function, not on the local Hono server. */
export async function submitQuizAttempt(quizId: number, correct: boolean): Promise<void> {
  try {
    const deviceId = await getDeviceId()
    const res = await fetch(`${PROD_BASE}/api/quiz-attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': deviceId },
      body: JSON.stringify({ quizId, correct }),
    })
    if (!res.ok) console.warn(`[api] submitQuizAttempt non-ok status: ${res.status}`)
  } catch (err) {
    console.warn('[api] submitQuizAttempt failed:', err)
  }
}
