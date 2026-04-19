import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { db } from '../db/client.js'
import { articles, feedback, saves } from '../db/schema.js'
import { eq, desc } from 'drizzle-orm'

const app = new Hono()

app.use('*', cors())

app.get('/api/feed', async (c) => {
  const date = c.req.query('date') ?? new Date().toISOString().slice(0, 10)
  const rows = await db
    .select()
    .from(articles)
    .where(eq(articles.briefDate, date))
    .orderBy(desc(articles.score))
  return c.json({ date, articles: rows })
})

app.post('/api/feedback', async (c) => {
  const { articleId, signal } = await c.req.json<{ articleId: string; signal: 'up' | 'down' }>()
  await db.insert(feedback).values({ articleId, signal, createdAt: new Date() })
  return c.json({ ok: true })
})

app.post('/api/save', async (c) => {
  const { articleId, userNote } = await c.req.json<{ articleId: string; userNote?: string }>()
  await db.insert(saves).values({ articleId, userNote: userNote ?? null, createdAt: new Date() })
  return c.json({ ok: true })
})

const port = Number(process.env.PORT ?? 3001)
console.log(`API server running on http://localhost:${port}`)
serve({ fetch: app.fetch, port })
