export const config = { runtime: 'edge' }

// GET /api/library[?days=N] — full reading history for the Library page.
//
// Edge + one Turso pipeline round trip (2026-10-01), replacing the Hono/Node
// route: the Node cold start was the slow part of opening Library, and the
// payload grows every day. `?days=N` returns only the latest N brief dates so
// the client can paint the top of the list first, then fetch the full history
// (search and filters run client-side, so they need all of it). Response shape
// matches the old Hono route: article columns in camelCase (score as a number)
// plus per-device feedback / saved / notionSynced / askMessageCount. Only the
// ask message *count* is read — never the messages JSON.

interface TursoCell { type: string; value?: string }
interface TursoResult { cols: { name: string }[]; rows: TursoCell[][] }
interface TursoPipelineResponse {
  results: Array<
    | { type: 'ok'; response: { type: string; result?: TursoResult } }
    | { type: 'error'; error: { message: string } }
  >
}

type Row = Record<string, string | null>

async function query(statements: { sql: string; args: unknown[] }[]): Promise<Row[][]> {
  const url = (process.env['TURSO_DATABASE_URL'] ?? '').replace('libsql://', 'https://')
  const token = process.env['TURSO_AUTH_TOKEN'] ?? ''
  const res = await fetch(`${url}/v2/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [...statements.map((stmt) => ({ type: 'execute', stmt })), { type: 'close' }],
    }),
  })
  if (!res.ok) throw new Error(`Turso pipeline HTTP ${res.status}: ${await res.text()}`)
  const json = (await res.json()) as TursoPipelineResponse
  return statements.map((_, i) => {
    const r = json.results[i]
    if (!r || r.type === 'error') throw new Error(`Turso query error: ${r && r.type === 'error' ? r.error.message : 'no result'}`)
    const result = r.response.result
    if (!result) return []
    return result.rows.map((row) => {
      const obj: Row = {}
      result.cols.forEach((c, j) => {
        const cell = row[j]
        obj[c.name] = !cell || cell.type === 'null' ? null : cell.value ?? null
      })
      return obj
    })
  })
}

const text = (v: string) => ({ type: 'text', value: v })
const int = (n: number) => ({ type: 'integer', value: String(n) })

// snake_case column → camelCase key, in the order the client's Article expects.
const ARTICLE_COLUMNS: [string, string][] = [
  ['id', 'id'], ['url', 'url'], ['title', 'title'], ['summary', 'summary'],
  ['context', 'context'], ['engineering_impact', 'engineeringImpact'], ['reason', 'reason'],
  ['short_judgment', 'shortJudgment'], ['category_tag', 'categoryTag'], ['skill_tags', 'skillTags'],
  ['render_level', 'renderLevel'], ['recommendation', 'recommendation'], ['score', 'score'],
  ['source', 'source'], ['brief_date', 'briefDate'],
]

const MAX_DAYS = 365

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    // Reflects per-device state (feedback / saves), so never cache at the edge.
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405 })

  const daysParam = new URL(req.url).searchParams.get('days')
  const days = daysParam === null ? null : Number(daysParam)
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > MAX_DAYS)) {
    return jsonResponse({ ok: false, error: 'invalid_days' }, 400)
  }
  const deviceId = req.headers.get('X-Device-Id')

  const columns = ARTICLE_COLUMNS.map(([c]) => c).join(', ')
  const articleSql = days === null
    ? `SELECT ${columns} FROM articles WHERE render_level != 'OMIT' ORDER BY brief_date DESC, score DESC`
    : `SELECT ${columns} FROM articles
       WHERE render_level != 'OMIT' AND brief_date >= (
         SELECT min(d) FROM (SELECT DISTINCT brief_date AS d FROM articles WHERE render_level != 'OMIT' ORDER BY d DESC LIMIT ?)
       )
       ORDER BY brief_date DESC, score DESC`

  const statements: { sql: string; args: unknown[] }[] = [
    { sql: articleSql, args: days === null ? [] : [int(days)] },
  ]
  if (deviceId) {
    statements.push(
      { sql: `SELECT article_id, signal FROM feedback WHERE device_id = ? AND signal IN ('up', 'down')`, args: [text(deviceId)] },
      { sql: `SELECT article_id, notion_page_id FROM saves WHERE device_id = ?`, args: [text(deviceId)] },
      { sql: `SELECT article_id, message_count FROM conversations WHERE device_id = ?`, args: [text(deviceId)] },
    )
  }
  if (days !== null) {
    statements.push({
      sql: `SELECT count(DISTINCT brief_date) AS n FROM articles WHERE render_level != 'OMIT'`,
      args: [],
    })
  }

  try {
    const results = await query(statements)
    const articleRows = results[0] ?? []
    const feedbackRows = deviceId ? results[1] ?? [] : []
    const saveRows = deviceId ? results[2] ?? [] : []
    const askRows = deviceId ? results[3] ?? [] : []
    const totalDays = days !== null ? Number(results[results.length - 1]?.[0]?.['n'] ?? 0) : null

    const feedback = new Map(feedbackRows.map((r) => [r['article_id'] ?? '', r['signal']]))
    const saves = new Map(saveRows.map((r) => [r['article_id'] ?? '', r['notion_page_id']]))
    const askCounts = new Map(askRows.map((r) => [r['article_id'] ?? '', Number(r['message_count'] ?? 0)]))

    const articles = articleRows.map((row) => {
      const a: Record<string, unknown> = {}
      for (const [col, key] of ARTICLE_COLUMNS) a[key] = row[col] ?? null
      a['score'] = Number(a['score'] ?? 0)
      a['skillTags'] = a['skillTags'] ?? '[]'
      const id = String(a['id'])
      return {
        ...a,
        feedback: feedback.get(id) ?? null,
        saved: saves.has(id),
        notionSynced: !!saves.get(id),
        askMessageCount: askCounts.get(id) ?? 0,
      }
    })

    return jsonResponse({
      articles,
      // Only for ?days=N: whether older dates exist beyond this slice.
      ...(totalDays !== null ? { hasMore: totalDays > (days ?? 0) } : {}),
    })
  } catch (err) {
    console.error('[library] query failed:', err)
    return jsonResponse({ ok: false, error: 'server_error' }, 500)
  }
}
