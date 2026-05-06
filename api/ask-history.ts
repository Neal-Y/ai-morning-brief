export const config = { runtime: 'edge' }

type Role = 'user' | 'assistant'

interface AskMessage {
  role: Role
  content: string
}

interface TursoExecuteRow {
  type: string
  value: string
}

interface TursoColumn {
  name: string
}

interface TursoQueryResult {
  type: 'ok'
  response: {
    type: 'execute'
    result: {
      cols: TursoColumn[]
      rows: TursoExecuteRow[][]
    }
  }
}

interface TursoPipelineResponse {
  results: Array<TursoQueryResult | { type: 'error'; error: { message: string } }>
}

const MAX_MESSAGES = 40
const MAX_CONTENT_CHARS = 4000
const MAX_TOTAL_CHARS = 60000

function tursoEnv(): { url: string; token: string } {
  const url = (process.env['TURSO_DATABASE_URL'] ?? '').replace('libsql://', 'https://')
  const token = process.env['TURSO_AUTH_TOKEN'] ?? ''
  return { url, token }
}

async function tursoPipeline(requests: unknown[]): Promise<TursoPipelineResponse> {
  const { url, token } = tursoEnv()
  const res = await fetch(`${url}/v2/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [...requests, { type: 'close' }] }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Turso pipeline HTTP ${res.status}: ${body}`)
  }
  const json = (await res.json()) as TursoPipelineResponse
  for (const item of json.results) {
    if (item.type === 'error') {
      throw new Error(`Turso pipeline item error: ${item.error.message}`)
    }
  }
  return json
}

function rowToObject(cols: TursoColumn[], row: TursoExecuteRow[]): Record<string, string | null> {
  const obj: Record<string, string | null> = {}
  cols.forEach((col, i) => {
    const cell = row[i]
    obj[col.name] = cell && cell.type !== 'null' ? cell.value : null
  })
  return obj
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function isArticleId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{16}$/.test(value)
}

function parseArticleIdFromUrl(req: Request): string | null {
  const id = new URL(req.url).searchParams.get('articleId')
  return isArticleId(id) ? id : null
}

function normalizeMessages(value: unknown): AskMessage[] | null {
  if (!Array.isArray(value) || value.length > MAX_MESSAGES) return null
  const messages: AskMessage[] = []
  let totalChars = 0

  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const role = (item as { role?: unknown }).role
    const content = (item as { content?: unknown }).content
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return null
    const trimmed = content.trim()
    if (!trimmed || trimmed.length > MAX_CONTENT_CHARS) return null
    totalChars += trimmed.length
    if (totalChars > MAX_TOTAL_CHARS) return null
    messages.push({ role, content: trimmed })
  }

  return messages
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'GET') {
    const articleId = parseArticleIdFromUrl(req)
    if (!articleId) return jsonResponse({ ok: false, error: 'invalid_article_id' }, 400)

    try {
      const lookup = await tursoPipeline([
        {
          type: 'execute',
          stmt: {
            sql: 'SELECT messages, message_count, updated_at FROM conversations WHERE article_id = ? LIMIT 1',
            args: [{ type: 'text', value: articleId }],
          },
        },
      ])
      const res = lookup.results[0]
      if (!res || res.type !== 'ok') return jsonResponse({ ok: false, error: 'db_error' }, 500)
      const row = res.response.result.rows[0]
      if (!row) return jsonResponse({ ok: true, messages: [], messageCount: 0, updatedAt: null })

      const obj = rowToObject(res.response.result.cols, row)
      const parsed = normalizeMessages(JSON.parse(obj['messages'] ?? '[]')) ?? []
      return jsonResponse({
        ok: true,
        messages: parsed,
        messageCount: Number(obj['message_count'] ?? parsed.length),
        updatedAt: obj['updated_at'],
      })
    } catch (err) {
      console.error('[ask-history] GET failed:', err)
      return jsonResponse({ ok: false, error: 'server_error' }, 500)
    }
  }

  if (req.method === 'POST') {
    let articleId: string
    let messages: AskMessage[]
    try {
      const body = (await req.json()) as { articleId?: unknown; messages?: unknown }
      if (!isArticleId(body.articleId)) {
        return jsonResponse({ ok: false, error: 'invalid_article_id' }, 400)
      }
      const normalized = normalizeMessages(body.messages)
      if (!normalized) return jsonResponse({ ok: false, error: 'invalid_messages' }, 400)
      articleId = body.articleId
      messages = normalized
    } catch {
      return jsonResponse({ ok: false, error: 'invalid_body' }, 400)
    }

    try {
      const now = String(Math.floor(Date.now() / 1000))
      await tursoPipeline([
        {
          type: 'execute',
          stmt: {
            sql:
              'INSERT INTO conversations (article_id, messages, message_count, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ' +
              'ON CONFLICT(article_id) DO UPDATE SET messages = excluded.messages, message_count = excluded.message_count, model = excluded.model, updated_at = excluded.updated_at',
            args: [
              { type: 'text', value: articleId },
              { type: 'text', value: JSON.stringify(messages) },
              { type: 'integer', value: String(messages.length) },
              { type: 'text', value: 'haiku' },
              { type: 'integer', value: now },
              { type: 'integer', value: now },
            ],
          },
        },
      ])
      return jsonResponse({ ok: true, messageCount: messages.length, updatedAt: now })
    } catch (err) {
      console.error('[ask-history] POST failed:', err)
      return jsonResponse({ ok: false, error: 'server_error' }, 500)
    }
  }

  return new Response('Method Not Allowed', { status: 405 })
}
