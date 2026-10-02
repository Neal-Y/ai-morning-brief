import { apiFetch } from './api.ts'

export interface AskMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AskHistory {
  messages: AskMessage[]
  messageCount: number
}

const QUIZ_PREFIX = 'quiz-'
const LS_PREFIX = 'mb_quiz_ask_'

/**
 * Quiz follow-ups cannot use the server-side `conversations` table.
 *
 * `api/ask-history.ts` validates articleId as /^[a-f0-9]{16}$/, and
 * `conversations.article_id` carries an enforced foreign key to `articles.id`,
 * so a synthetic `quiz-<id>` is rejected twice over. (The Sift app hits the
 * same wall — its saveAskHistory swallows the 400, which is why quiz history
 * has never actually persisted there.)
 *
 * Rather than change the backend, quiz threads are kept in localStorage. Reach
 * is equivalent in practice: there are no accounts, and DB rows are scoped to a
 * device id that is itself just a localStorage/AsyncStorage UUID.
 *
 * Article follow-ups are unaffected and still go to the API.
 */
function isQuizThread(articleId: string): boolean {
  return articleId.startsWith(QUIZ_PREFIX)
}

function readLocal(articleId: string): AskHistory {
  try {
    const raw = localStorage.getItem(LS_PREFIX + articleId)
    if (!raw) return { messages: [], messageCount: 0 }
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return { messages: [], messageCount: 0 }
    const messages = parsed.filter((m): m is AskMessage =>
      !!m && typeof m === 'object' &&
      ((m as AskMessage).role === 'user' || (m as AskMessage).role === 'assistant') &&
      typeof (m as AskMessage).content === 'string')
    return { messages, messageCount: messages.length }
  } catch {
    return { messages: [], messageCount: 0 }
  }
}

export async function loadAskHistory(articleId: string): Promise<AskHistory> {
  if (isQuizThread(articleId)) return readLocal(articleId)

  const response = await apiFetch(`/api/ask-history?articleId=${encodeURIComponent(articleId)}`)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const data = await response.json() as { messages?: AskMessage[]; messageCount?: number }
  const messages = Array.isArray(data.messages) ? data.messages : []
  return { messages, messageCount: data.messageCount ?? messages.length }
}

// Same limits as api/ask-history.ts (MAX_MESSAGES / MAX_CONTENT_CHARS /
// MAX_TOTAL_CHARS). The server rejects anything larger, so from the 21st
// exchange on every save used to fail silently; keep the newest turns instead.
export const MAX_SAVED_MESSAGES = 40
const MAX_SAVED_CONTENT = 4000
const MAX_SAVED_TOTAL = 60000

export function trimForStorage(messages: AskMessage[]): AskMessage[] {
  const clipped = messages.map(m => ({ role: m.role, content: m.content.slice(0, MAX_SAVED_CONTENT) }))
  let start = Math.max(0, clipped.length - MAX_SAVED_MESSAGES)
  let total = clipped.slice(start).reduce((n, m) => n + m.content.length, 0)
  while (start < clipped.length && (total > MAX_SAVED_TOTAL || clipped[start]!.role !== 'user')) {
    total -= clipped[start]!.content.length
    start++
  }
  return clipped.slice(start)
}

/** Returns the persisted message count, or null when nothing was persisted. */
export async function saveAskHistory(articleId: string, allMessages: AskMessage[]): Promise<number | null> {
  const messages = trimForStorage(allMessages)
  if (messages.length === 0) return null

  if (isQuizThread(articleId)) {
    try {
      localStorage.setItem(LS_PREFIX + articleId, JSON.stringify(messages))
      return messages.length
    } catch {
      return null // quota / private mode — asking still works
    }
  }

  try {
    const response = await apiFetch('/api/ask-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleId, messages }),
    })
    const data = await response.json().catch(() => ({})) as { ok?: boolean; messageCount?: number }
    if (!response.ok || !data.ok) return null
    return data.messageCount ?? messages.length
  } catch {
    return null // Ask still works if history persistence is unavailable
  }
}
