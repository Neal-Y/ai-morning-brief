import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { and, count, desc, eq, gte, inArray } from 'drizzle-orm'
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

  // Reading is activity, never a preference. Filter before LIMIT/threshold so
  // neutral reads cannot crowd out votes or enable preference learning.
  const whereClause = and(
    gte(feedback.createdAt, windowStart),
    inArray(feedback.signal, ['up', 'down']),
    deviceId ? eq(feedback.deviceId, deviceId) : undefined,
  )

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


// ── Idle / stock checks (2026-10-01) ────────────────────────────────────────
// The pipelines skip their LLM calls when nobody would read the output.

/**
 * Most recent sign that anyone is using the app: a read/👍/👎, a quiz answer, or an
 * app open. Opening the Feed in the installed PWA re-posts the push
 * subscription (web/src/App.tsx → /api/push-subscribe), which rewrites
 * `push_subscriptions.updated_at` — so a bare open counts, not only a swipe.
 * Null when there has never been any activity.
 */
export async function getLastActivityAt(): Promise<Date | null> {
  const rs = await client.execute(`
    SELECT max(t) AS t FROM (
      SELECT max(created_at) AS t FROM feedback
      UNION ALL SELECT max(answered_at) FROM quiz_attempts
      UNION ALL SELECT max(updated_at) FROM push_subscriptions
    )`)
  const t = rs.rows[0]?.['t']
  return t == null ? null : new Date(Number(t) * 1000)
}

/**
 * Unanswered questions left for each device that answered at least one quiz
 * in the last `activeDays` days. Empty when nobody has been answering.
 * (Reported questions still count toward the pool — a handful at most.)
 */
export async function getUnseenQuizCounts(activeDays: number): Promise<{ deviceId: string; unseen: number }[]> {
  const since = Math.floor((Date.now() - activeDays * 24 * 60 * 60 * 1000) / 1000)
  const rs = await client.execute({
    sql: `
      SELECT d.device_id AS device_id,
             (SELECT count(*) FROM quizzes)
               - (SELECT count(DISTINCT a.quiz_id) FROM quiz_attempts a WHERE a.device_id = d.device_id) AS unseen
      FROM (SELECT DISTINCT device_id FROM quiz_attempts WHERE device_id IS NOT NULL AND answered_at >= ?) d`,
    args: [since],
  })
  return rs.rows.map((r) => ({ deviceId: String(r['device_id']), unseen: Number(r['unseen']) }))
}
