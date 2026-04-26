import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { db } from '../db/client.js'
import { getTaipeiDateString } from '../date.js'
import { articles } from '../db/schema.js'
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

// NOTE: /api/save, /api/push-subscribe, and /api/feedback are NOT defined here.
// In production, Vercel rewrites them directly to api/save.ts,
// api/push-subscribe.ts, and api/feedback.ts (Edge Runtime). The Hono/Node.js
// adapter hangs on request body reading for these endpoints — the Edge
// Runtime's native Request object works around it. All POST endpoints that
// need to read the body live as Edge functions; this Hono app is now read-only.

export default app
