export const config = { runtime: 'edge' }

// GET /api/feed?date=YYYY-MM-DD — today's brief.
//
// Moved off the Hono/Node function (2026-09-29): the feed is the first request
// every morning, so it nearly always hit a cold Node start (Node + libSQL +
// drizzle). An Edge function cold-starts in tens of ms. Response shape must
// stay identical to what drizzle returned: camelCase keys, `score` as a
// number, `classifiedAt` as an ISO string.

interface TursoCell { type: string; value?: string }
interface TursoColumn { name: string }
interface TursoPipelineResponse {
  results: Array<
    | { type: 'ok'; response: { type: 'execute'; result: { cols: TursoColumn[]; rows: TursoCell[][] } } }
    | { type: 'error'; error: { message: string } }
  >
}

const COLUMNS: Array<[string, string]> = [
  ['id', 'id'],
  ['url', 'url'],
  ['title', 'title'],
  ['summary', 'summary'],
  ['context', 'context'],
  ['engineering_impact', 'engineeringImpact'],
  ['reason', 'reason'],
  ['short_judgment', 'shortJudgment'],
  ['category_tag', 'categoryTag'],
  ['skill_tags', 'skillTags'],
  ['render_level', 'renderLevel'],
  ['recommendation', 'recommendation'],
  ['score', 'score'],
  ['source', 'source'],
  ['brief_date', 'briefDate'],
  ['classified_at', 'classifiedAt'],
]

function taipeiToday(): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function jsonResponse(body: unknown, status: number, cacheControl: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': cacheControl },
  })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405 })

  const dateParam = new URL(req.url).searchParams.get('date')
  if (dateParam !== null && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return jsonResponse({ ok: false, error: 'invalid_date' }, 400, 'no-store')
  }
  const date = dateParam ?? taipeiToday()

  const url = (process.env['TURSO_DATABASE_URL'] ?? '').replace('libsql://', 'https://')
  const token = process.env['TURSO_AUTH_TOKEN'] ?? ''

  try {
    const res = await fetch(`${url}/v2/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            type: 'execute',
            stmt: {
              sql: `SELECT ${COLUMNS.map(([c]) => c).join(', ')} FROM articles WHERE brief_date = ? ORDER BY score DESC`,
              args: [{ type: 'text', value: date }],
            },
          },
          { type: 'close' },
        ],
      }),
    })
    if (!res.ok) throw new Error(`Turso pipeline HTTP ${res.status}: ${await res.text()}`)
    const json = (await res.json()) as TursoPipelineResponse
    const first = json.results[0]
    if (!first || first.type !== 'ok') {
      throw new Error(`Turso query error: ${first && first.type === 'error' ? first.error.message : 'no result'}`)
    }

    const { cols, rows } = first.response.result
    const articles = rows.map((row) => {
      const obj: Record<string, unknown> = {}
      cols.forEach((col, i) => {
        const key = COLUMNS.find(([c]) => c === col.name)?.[1] ?? col.name
        const cell = row[i]
        obj[key] = !cell || cell.type === 'null' ? null : cell.value ?? null
      })
      obj['score'] = Number(obj['score'] ?? 0)
      const ts = Number(obj['classifiedAt'])
      obj['classifiedAt'] = Number.isFinite(ts) ? new Date(ts * 1000).toISOString() : null
      return obj
    })

    // Populated days are immutable once the daily pipeline finishes. Empty
    // responses cache briefly so a PWA opened before the cron run isn't stuck.
    return jsonResponse(
      { date, articles },
      200,
      articles.length > 0
        ? 'public, s-maxage=300, stale-while-revalidate=300'
        : 'public, s-maxage=30',
    )
  } catch (err) {
    console.error('[feed] query failed:', err)
    return jsonResponse({ ok: false, error: 'server_error' }, 500, 'no-store')
  }
}
