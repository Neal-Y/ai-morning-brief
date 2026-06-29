import Constants from 'expo-constants'
import { getDeviceId } from './device'

const PROD_BASE = 'https://ai-morning-brief.vercel.app'
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
