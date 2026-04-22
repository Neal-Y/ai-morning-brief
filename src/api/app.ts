import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { streamSSE } from 'hono/streaming'
import Anthropic from '@anthropic-ai/sdk'
import { db } from '../db/client.js'
import { articles, feedback, saves } from '../db/schema.js'
import { eq, desc } from 'drizzle-orm'

interface AskMessage {
  role: 'user' | 'assistant'
  content: string
}

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

app.post('/api/ask', async (c) => {
  const { articleTitle, articleSummary, articleContext, messages } =
    await c.req.json<{
      articleTitle: string
      articleSummary: string
      articleContext: string
      messages: AskMessage[]
    }>()

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)

  const anthropic = new Anthropic({ apiKey })

  const systemPrompt = `你是一位後端工程師的技術顧問，正在協助用戶深入閱讀一篇技術文章。

文章：「${articleTitle}」
摘要：${articleSummary}${articleContext ? `\n脈絡：${articleContext}` : ''}

請用繁體中文回答，聚焦工程實務視角，簡潔有力（150字以內）。`

  return streamSSE(c, async (stream) => {
    const anthropicStream = anthropic.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: systemPrompt,
      messages,
    })

    for await (const event of anthropicStream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        await stream.writeSSE({ data: JSON.stringify(event.delta.text) })
      }
    }
    await stream.writeSSE({ data: '[DONE]' })
  })
})

export default app