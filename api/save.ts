import {
  createSavePage,
  findSavePageByArticleId,
  type NotionArticleInput,
} from '../src/notion/client.js'

export const config = { runtime: 'edge' }

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
      affected_row_count?: number
      last_insert_rowid?: string
    }
  }
}

interface TursoPipelineResponse {
  results: Array<TursoQueryResult | { type: 'error'; error: { message: string } }>
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
  // Turso returns 200 even when individual SQL items fail — each result is
  // either { type: 'ok', response } or { type: 'error', error }. We must
  // surface item-level failures explicitly, otherwise a failed write would
  // silently look like success.
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

function affectedCount(result: TursoPipelineResponse['results'][number] | undefined): number {
  if (!result || result.type !== 'ok') return 0
  return result.response.result.affected_row_count ?? 0
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
  let userNote: string | null = null
  try {
    const body = (await req.json()) as { articleId?: unknown; userNote?: unknown }
    // articleId is SHA-256(url).slice(0,16) — 16 lowercase hex chars. Tight
    // shape check rejects garbage before we touch Turso or Notion.
    if (typeof body.articleId !== 'string' || !/^[a-f0-9]{16}$/.test(body.articleId)) {
      return jsonResponse({ ok: false, error: 'invalid_article_id' }, 400)
    }
    articleId = body.articleId
    if (typeof body.userNote === 'string') {
      const trimmed = body.userNote.trim()
      if (trimmed.length === 0) {
        userNote = null
      } else if (trimmed.length > 4000) {
        return jsonResponse({ ok: false, error: 'user_note_too_long' }, 400)
      } else {
        userNote = trimmed
      }
    }
  } catch {
    return jsonResponse({ ok: false, error: 'invalid_body' }, 400)
  }

  try {
    const lookup = await tursoPipeline([
      {
        type: 'execute',
        stmt: {
          sql:
            'SELECT id, url, title, summary, context, engineering_impact, reason, short_judgment, category_tag, score, source, brief_date FROM articles WHERE id = ? LIMIT 1',
          args: [{ type: 'text', value: articleId }],
        },
      },
    ])

    // tursoPipeline throws on item errors, so any item here is { type: 'ok' }.
    const articleRes = lookup.results[0]
    if (!articleRes || articleRes.type !== 'ok') {
      console.error('[save] Turso lookup unexpected shape')
      return jsonResponse({ ok: false, error: 'db_error' }, 500)
    }

    const articleRow = articleRes.response.result.rows[0]
    if (!articleRow) {
      return jsonResponse({ ok: false, error: 'article_not_found' }, 404)
    }
    const article = rowToObject(articleRes.response.result.cols, articleRow)

    const articleInput: NotionArticleInput = {
      id: article['id'] ?? articleId,
      url: article['url'] ?? '',
      title: article['title'] ?? '',
      source: article['source'] ?? null,
      categoryTag: article['category_tag'] ?? '',
      score: Number(article['score'] ?? 0),
      briefDate: article['brief_date'] ?? '',
      summary: article['summary'] ?? '',
      context: article['context'] ?? '',
      reason: article['reason'] ?? '',
      engineeringImpact: article['engineering_impact'] ?? '',
      shortJudgment: article['short_judgment'] ?? null,
    }

    const nowSeconds = Math.floor(Date.now() / 1000)
    const now = String(nowSeconds)

    await tursoPipeline([
      {
        type: 'execute',
        stmt: {
          sql:
            'INSERT INTO saves (article_id, user_note, notion_page_id, created_at, updated_at, deleted_at) VALUES (?, ?, NULL, ?, ?, NULL) ' +
            'ON CONFLICT(article_id) DO UPDATE SET user_note = excluded.user_note, deleted_at = NULL, updated_at = excluded.updated_at',
          args: [
            { type: 'text', value: articleId },
            userNote === null ? { type: 'null' } : { type: 'text', value: userNote },
            { type: 'integer', value: now },
            { type: 'integer', value: now },
          ],
        },
      },
    ])

    const saveLookup = await tursoPipeline([
      {
        type: 'execute',
        stmt: {
          sql: 'SELECT notion_page_id FROM saves WHERE article_id = ? LIMIT 1',
          args: [{ type: 'text', value: articleId }],
        },
      },
    ])
    const saveRes = saveLookup.results[0]
    if (!saveRes || saveRes.type !== 'ok') {
      console.error('[save] Save lookup unexpected shape')
      return jsonResponse({ ok: false, error: 'db_error' }, 500)
    }
    const existingSaveRow = saveRes.response.result.rows[0]
    const existingSave = existingSaveRow
      ? rowToObject(saveRes.response.result.cols, existingSaveRow)
      : null

    if (existingSave?.notion_page_id) {
      return jsonResponse({ ok: true, notionSynced: true, notionPageId: existingSave.notion_page_id })
    }

    const staleSyncBefore = String(nowSeconds - 10 * 60)
    const lock = await tursoPipeline([
      {
        type: 'execute',
        stmt: {
          sql:
            'UPDATE saves SET notion_syncing_at = ?, updated_at = ? ' +
            'WHERE article_id = ? AND notion_page_id IS NULL ' +
            'AND (notion_syncing_at IS NULL OR notion_syncing_at < ?)',
          args: [
            { type: 'integer', value: now },
            { type: 'integer', value: now },
            { type: 'text', value: articleId },
            { type: 'integer', value: staleSyncBefore },
          ],
        },
      },
    ])

    if (affectedCount(lock.results[0]) === 0) {
      return jsonResponse({ ok: true, notionSynced: false, notionSyncing: true })
    }

    let notionPageId: string | null = null
    let notionSynced = false
    try {
      const existingPage = await findSavePageByArticleId(articleId)
      if (existingPage.pageId) {
        notionPageId = existingPage.pageId
      } else {
        const result = await createSavePage({ article: articleInput, userNote })
        notionPageId = result.pageId
      }
      notionSynced = true
    } catch (err) {
      console.error('[save] Notion create failed:', err)
    }

    await tursoPipeline([
      {
        type: 'execute',
        stmt: {
          sql:
            'UPDATE saves SET notion_page_id = ?, notion_syncing_at = NULL, updated_at = ? WHERE article_id = ?',
          args: [
            notionPageId === null ? { type: 'null' } : { type: 'text', value: notionPageId },
            { type: 'integer', value: String(Math.floor(Date.now() / 1000)) },
            { type: 'text', value: articleId },
          ],
        },
      },
    ])

    return jsonResponse({ ok: true, notionSynced, notionPageId })
  } catch (err) {
    console.error('[save] Failed:', err)
    return jsonResponse({ ok: false, error: 'server_error' }, 500)
  }
}
