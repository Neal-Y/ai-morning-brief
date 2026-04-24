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

app.post('/api/push-subscribe', async (c) => {
  try {
    const { endpoint, keys } = await c.req.json<{
      endpoint: string
      keys: { p256dh: string; auth: string }
    }>()
    const dbUrl = (process.env['TURSO_DATABASE_URL'] ?? '').replace('libsql://', 'https://')
    const token = process.env['TURSO_AUTH_TOKEN'] ?? ''
    const res = await fetch(`${dbUrl}/v2/pipeline`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          { type: 'execute', stmt: { sql: 'DELETE FROM push_subscriptions WHERE endpoint = ?', args: [{ type: 'text', value: endpoint }] } },
          { type: 'execute', stmt: { sql: 'INSERT INTO push_subscriptions (endpoint, p256dh, auth, updated_at) VALUES (?, ?, ?, ?)', args: [{ type: 'text', value: endpoint }, { type: 'text', value: keys.p256dh }, { type: 'text', value: keys.auth }, { type: 'integer', value: String(Date.now()) }] } },
          { type: 'close' },
        ],
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      console.error('[push-subscribe] Turso error:', res.status, body)
      return c.json({ ok: false, error: `turso ${res.status}` }, 500)
    }
    console.log('[push-subscribe] OK')
    return c.json({ ok: true })
  } catch (err) {
    console.error('[push-subscribe] Failed:', err)
    return c.json({ ok: false, error: String(err) }, 500)
  }
})

export default app
