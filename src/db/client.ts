import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { and, count, desc, eq, gte } from 'drizzle-orm'
import * as schema from './schema.js'
import { articles, feedback, quizReports, quizzes } from './schema.js'

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

const QUIZ_DEDUP_WINDOW_DAYS = 30
const QUIZ_DEDUP_MAX_ROWS = 60

/** Total questions in the pool. /api/quiz recycles, so any non-empty pool serves a full set. */
export async function getQuizPoolSize(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(quizzes)
  return row?.n ?? 0
}

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

/** True for "no such table" (possibly wrapped by drizzle as a query error's cause). */
export function isMissingTable(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e && depth < 3; e = (e as { cause?: unknown }).cause, depth++) {
    if (e instanceof Error && /no such table/i.test(e.message)) return true
  }
  return false
}

export interface ReportedQuiz {
  prompt: string
  reason: string
}

const REPORTED_MAX_ROWS = 30

/**
 * Questions users reported as flawed, newest first, for the generator's AVOID
 * block. The table is created lazily on the first report, so "no such table"
 * just means nothing has been reported yet.
 */
export async function getReportedQuizzes(): Promise<ReportedQuiz[]> {
  try {
    return await db
      .select({ prompt: quizzes.prompt, reason: quizReports.reason })
      .from(quizReports)
      .innerJoin(quizzes, eq(quizReports.quizId, quizzes.id))
      .orderBy(desc(quizReports.createdAt))
      .limit(REPORTED_MAX_ROWS)
  } catch (err) {
    if (isMissingTable(err)) return []
    throw err
  }
}

