import Constants from 'expo-constants'
import { fetch as expoFetch } from 'expo/fetch'
import { getDeviceId } from './device'

const PROD_BASE = 'https://ai-morning-brief-chi.vercel.app'
const DEV_API_PORT = 3001

/**
 * Resolve the API base URL:
 *  1. EXPO_PUBLIC_API_BASE_URL — explicit override (app/.env), if set.
 *  2. In Expo Go dev, auto-derive from the Metro host so the local API tracks
 *     the Mac's LAN IP automatically — no manual edits when the Wi-Fi changes.
 *  3. Production build → prod URL.
 */
function resolveApiBase(): string {
  const override = process.env.EXPO_PUBLIC_API_BASE_URL
  if (override) return override

  // e.g. "192.168.0.158:8081" — the IP Metro is served from.
  const hostUri = Constants.expoConfig?.hostUri
  if (hostUri) {
    const host = hostUri.split(':')[0]
    if (host) return `http://${host}:${DEV_API_PORT}`
  }

  return PROD_BASE
}

const API_BASE = resolveApiBase()

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const deviceId = await getDeviceId()
  const headers = new Headers(init?.headers)
  headers.set('X-Device-Id', deviceId)
  return fetch(`${API_BASE}${path}`, { ...init, headers })
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

/** Fire-and-forget — a failed attempt log must never block the quiz flow. */
export async function submitQuizAttempt(quizId: number, correct: boolean): Promise<void> {
  try {
    const res = await apiFetch('/api/quiz-attempt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quizId, correct }),
    })
    if (!res.ok) console.warn(`[api] submitQuizAttempt non-ok status: ${res.status}`)
  } catch (err) {
    console.warn('[api] submitQuizAttempt failed:', err)
  }
}
