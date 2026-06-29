import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { and, desc, eq, gte } from 'drizzle-orm'
import * as schema from './schema.js'
import { articles, feedback, quizzes } from './schema.js'

// Use https:// transport (HTTP requests, not WebSocket) — required for Vercel
// serverless / edge environments where short-lived WebSocket connections hang.
const client = createClient({
  url: process.env.TURSO_DATABASE_URL!.replace('libsql://', 'https://'),
  authToken: process.env.TURSO_AUTH_TOKEN,
})

export const db = drizzle(client, { schema })

export interface FeedbackRow {
  articleId: string
  title: string
  categoryTag: string
  signal: 'up' | 'down'
}

const FEEDBACK_MIN_THRESHOLD = 10
export const FEEDBACK_WINDOW_DAYS = 30
const FEEDBACK_MAX_ROWS = 20

/**
 * Fetch recent feedback joined with article metadata.
 *
 * Without deviceId: returns global feedback across all users, gated by
 * FEEDBACK_MIN_THRESHOLD (cold-start protection for LLM preference injection).
 *
 * With deviceId: returns only that device's feedback, no threshold gate
 * (even 1 signal is useful for per-user Stage 3 reranking).
 */
export async function getRecentFeedback(deviceId?: string): Promise<FeedbackRow[]> {
  const windowStart = new Date(Date.now() - FEEDBACK_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const whereClause = deviceId
    ? and(gte(feedback.createdAt, windowStart), eq(feedback.deviceId, deviceId))
    : gte(feedback.createdAt, windowStart)

  const rows = await db
    .select({
      articleId: feedback.articleId,
      title: articles.title,
      categoryTag: articles.categoryTag,
      signal: feedback.signal,
    })
    .from(feedback)
    .innerJoin(articles, eq(feedback.articleId, articles.id))
    .where(whereClause)
    .orderBy(desc(feedback.createdAt))
    .limit(FEEDBACK_MAX_ROWS)

  if (!deviceId && rows.length < FEEDBACK_MIN_THRESHOLD) return []
  return rows as FeedbackRow[]
}

export const QUIZ_DEDUP_WINDOW_DAYS = 30
const QUIZ_DEDUP_MAX_ROWS = 60

/** Recent quiz prompts, used to steer the generator away from repeats. */
export async function getRecentQuizPrompts(): Promise<string[]> {
  const windowStart = new Date(Date.now() - QUIZ_DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const rows = await db
    .select({ prompt: quizzes.prompt })
    .from(quizzes)
    .where(gte(quizzes.createdAt, windowStart))
    .orderBy(desc(quizzes.createdAt))
    .limit(QUIZ_DEDUP_MAX_ROWS)

  return rows.map((r) => r.prompt)
}
