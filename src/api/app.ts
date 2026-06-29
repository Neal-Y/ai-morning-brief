import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { db } from '../db/client.js'
import { getTaipeiDateString } from '../date.js'
import { articles, feedback, saves, quizzes, quizAttempts } from '../db/schema.js'
import { eq, desc, and, inArray, notInArray } from 'drizzle-orm'

// NOTE: /api/ask is NOT defined here. In production, Vercel rewrites /api/ask
// directly to api/ask.ts (Edge Runtime, raw fetch streaming). Keeping a Hono
// duplicate here leads to prompt-drift between the two implementations and
// confusion about which one actually runs. Local `npm run dev:api` therefore
// cannot exercise /api/ask — test Ask against a Vercel preview deployment.

const app = new Hono()

app.use('*', cors())

app.get('/api/feed', async (c) => {
  const date = c.req.query('date') ?? getTaipeiDateString()
  const rows = await db
    .select()
    .from(articles)
    .where(eq(articles.briefDate, date))
    .orderBy(desc(articles.score))
  // Cache populated days at the edge (rows are immutable once the daily
  // pipeline finishes). For empty responses we use a short cache so a PWA
  // opened before the cron run isn't stuck on stale empty data for 5 minutes.
  c.header(
    'Cache-Control',
    rows.length > 0
      ? 'public, s-maxage=300, stale-while-revalidate=300'
      : 'public, s-maxage=30',
  )
  return c.json({ date, articles: rows })
})

app.get('/api/library', async (c) => {
  // Library is read-only history. Three small tables, joined in JS to avoid
  // duplicating articles when an article has multiple feedback rows. In
  // practice feedback is delete-then-insert so at most one per article, but
  // we don't want this endpoint to depend on that invariant.
  const deviceId = c.req.header('X-Device-Id') ?? null
  const [articleRows, feedbackRows, savesRows] = await Promise.all([
    db.select().from(articles).orderBy(desc(articles.briefDate), desc(articles.score)),
    deviceId
      ? db.select().from(feedback).where(eq(feedback.deviceId, deviceId))
      : Promise.resolve([]),
    deviceId
      ? db.select().from(saves).where(eq(saves.deviceId, deviceId))
      : Promise.resolve([]),
  ])

  const feedbackMap = new Map<string, 'up' | 'down'>()
  for (const f of feedbackRows) {
    if (f.signal === 'up' || f.signal === 'down') feedbackMap.set(f.articleId, f.signal)
  }
  const savesMap = new Map<string, { notionPageId: string | null }>()
  for (const s of savesRows) {
    savesMap.set(s.articleId, { notionPageId: s.notionPageId })
  }

  const enriched = articleRows
    .filter((a) => a.renderLevel !== 'OMIT')
    .map((a) => ({
      ...a,
      feedback: feedbackMap.get(a.id) ?? null,
      saved: savesMap.has(a.id),
      notionSynced: !!savesMap.get(a.id)?.notionPageId,
    }))

  // Library reflects user state (feedback/saves), so don't cache at the edge.
  c.header('Cache-Control', 'private, no-store')
  return c.json({ articles: enriched })
})

const MAX_QUIZ_COUNT = 20

app.get('/api/quiz', async (c) => {
  const countParam = Number(c.req.query('count') ?? '5')
  const count = Number.isFinite(countParam) && countParam > 0 ? Math.min(countParam, MAX_QUIZ_COUNT) : 5
  // `type` accepts a single value or a comma list (e.g. "single_choice,ordering")
  // so the client can request only the types it can currently render.
  const typeParam = c.req.query('type') ?? null
  const types = typeParam ? typeParam.split(',').map((t) => t.trim()).filter(Boolean) : []
  const deviceId = c.req.header('X-Device-Id') ?? null
  const typeFilter = types.length > 0 ? inArray(quizzes.type, types) : null

  let attemptedIds: number[] = []
  if (deviceId) {
    const rows = await db
      .select({ quizId: quizAttempts.quizId })
      .from(quizAttempts)
      .where(eq(quizAttempts.deviceId, deviceId))
    attemptedIds = rows.map((r) => r.quizId)
  }

  // Prefer questions this device hasn't seen yet.
  const freshCondition =
    attemptedIds.length > 0
      ? typeFilter
        ? and(typeFilter, notInArray(quizzes.id, attemptedIds))
        : notInArray(quizzes.id, attemptedIds)
      : typeFilter

  const freshQuery = db.select().from(quizzes).orderBy(desc(quizzes.createdAt)).limit(count)
  const fresh = freshCondition ? await freshQuery.where(freshCondition) : await freshQuery

  // Pool exhausted (device has answered everything matching the filter) —
  // recycle already-attempted questions rather than returning fewer than asked.
  let result = fresh
  if (result.length < count && attemptedIds.length > 0) {
    const need = count - result.length
    const recycleCondition = typeFilter
      ? and(typeFilter, inArray(quizzes.id, attemptedIds))
      : inArray(quizzes.id, attemptedIds)
    const recycled = await db
      .select()
      .from(quizzes)
      .where(recycleCondition)
      .orderBy(desc(quizzes.createdAt))
      .limit(need)
    result = [...result, ...recycled]
  }

  // Parse per-row and skip any malformed payload — one bad row must not 500 the
  // whole quiz feed (leaving the user with nothing to answer).
  const payload = result.flatMap((q) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(q.payload)
    } catch {
      console.warn(`[api/quiz] Skipping quiz ${q.id} — malformed payload JSON`)
      return []
    }
    return [{
      id: q.id,
      type: q.type,
      category: q.category,
      prompt: q.prompt,
      payload: parsed,
      explanation: q.explanation,
      sourceName: q.sourceName,
      sourceUrl: q.sourceUrl,
    }]
  })

  // Reflects per-device attempt history, so don't cache at the edge.
  c.header('Cache-Control', 'private, no-store')
  return c.json({ quizzes: payload })
})

// NOTE: /api/save, /api/push-subscribe, /api/feedback, and /api/quiz-attempt
// are NOT defined here. In production, Vercel rewrites them directly to
// api/save.ts, api/push-subscribe.ts, api/feedback.ts, and api/quiz-attempt.ts
// (Edge Runtime). The Hono/Node.js adapter hangs on request body reading for
// these endpoints — the Edge Runtime's native Request object works around it.
// All POST endpoints that need to read the body live as Edge functions; this
// Hono app is now read-only.

export default app
