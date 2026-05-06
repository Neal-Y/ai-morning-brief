export const config = { runtime: 'edge' }

interface TursoPipelineItemResult {
  type: 'ok' | 'error'
  error?: { message: string }
}

interface TursoPipelineResponse {
  results: TursoPipelineItemResult[]
}

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
      throw new Error(`Turso pipeline item error: ${item.error?.message ?? 'unknown'}`)
    }
  }
  return json
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  let articleId: string
  try {
    const body = (await req.json()) as { articleId?: unknown }
    if (typeof body.articleId !== 'string' || !/^[a-f0-9]{16}$/.test(body.articleId)) {
      return jsonResponse({ ok: false, error: 'invalid_article_id' }, 400)
    }
    articleId = body.articleId
  } catch {
    return jsonResponse({ ok: false, error: 'invalid_body' }, 400)
  }

  // We don't archive the Notion page here. The user's PKM workflow lives in
  // Notion; unsaving only hides the item in-app. Keeping the row preserves the
  // Notion page id so a later re-save can reattach instead of creating a duplicate.
  try {
    const now = String(Math.floor(Date.now() / 1000))
    await tursoPipeline([
      {
        type: 'execute',
        stmt: {
          sql: 'UPDATE saves SET deleted_at = ?, updated_at = ? WHERE article_id = ?',
          args: [
            { type: 'integer', value: now },
            { type: 'integer', value: now },
            { type: 'text', value: articleId },
          ],
        },
      },
    ])
    return jsonResponse({ ok: true })
  } catch (err) {
    console.error('[unsave] Failed:', err)
    return jsonResponse({ ok: false, error: 'server_error' }, 500)
  }
}
