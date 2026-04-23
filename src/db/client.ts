import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { desc, eq, gte } from 'drizzle-orm'
import * as schema from './schema.js'
import { articles, feedback } from './schema.js'

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

export const db = drizzle(client, { schema })

export interface FeedbackRow {
  articleId: string
  title: string
  categoryTag: string
  signal: 'up' | 'down'
}

export const FEEDBACK_MIN_THRESHOLD = 10
export const FEEDBACK_WINDOW_DAYS = 30
export const FEEDBACK_MAX_ROWS = 20

/**
 * Fetch recent feedback joined with article metadata, for classifier preference context.
 * Returns [] if total signals are below FEEDBACK_MIN_THRESHOLD (cold-start protection
 * against over-fitting to a handful of clicks).
 */
export async function getRecentFeedback(): Promise<FeedbackRow[]> {
  const windowStart = new Date(Date.now() - FEEDBACK_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const rows = await db
    .select({
      articleId: feedback.articleId,
      title: articles.title,
      categoryTag: articles.categoryTag,
      signal: feedback.signal,
    })
    .from(feedback)
    .innerJoin(articles, eq(feedback.articleId, articles.id))
    .where(gte(feedback.createdAt, windowStart))
    .orderBy(desc(feedback.createdAt))
    .limit(FEEDBACK_MAX_ROWS)

  if (rows.length < FEEDBACK_MIN_THRESHOLD) return []
  return rows as FeedbackRow[]
}
