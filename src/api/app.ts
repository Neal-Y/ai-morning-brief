import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { db } from '../db/client.js'
import { getTaipeiDateString } from '../date.js'
import { articles, feedback, saves } from '../db/schema.js'
import { eq, desc } from 'drizzle-orm'

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
  return c.json({ date, articles: rows })
})

app.post('/api/feedback', async (c) => {
  const { articleId, signal } = await c.req.json<{ articleId: string; signal: 'up' | 'down' }>()
  // Only keep the latest feedback per article — prevents accidental double-taps
  // from doubling weight in classifier preference context.
  await db.delete(feedback).where(eq(feedback.articleId, articleId))
  await db.insert(feedback).values({ articleId, signal, createdAt: new Date() })
  return c.json({ ok: true })
})

app.post('/api/save', async (c) => {
  const { articleId, userNote } = await c.req.json<{ articleId: string; userNote?: string }>()
  await db.insert(saves).values({ articleId, userNote: userNote ?? null, createdAt: new Date() })
  return c.json({ ok: true })
})

export default app
