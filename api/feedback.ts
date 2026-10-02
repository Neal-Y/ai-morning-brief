export const config = { runtime: 'edge' }

type TursoArg = { type: 'text' | 'integer'; value: string }
type Statement = { sql: string; args?: TursoArg[] }
type Condition = { type: 'ok'; step: number } | { type: 'not'; cond: Condition }
interface BatchStep { stmt: Statement; condition?: Condition }
interface TursoPipelineResponse {
  results: Array<{
    type: 'ok' | 'error'
    error?: { message: string }
    response?: { result?: { step_results: unknown[]; step_errors: Array<{ message: string } | null> } }
  }>
}

const text = (value: string): TursoArg => ({ type: 'text', value })
const int = (value: number): TursoArg => ({ type: 'integer', value: String(value) })

// A conditional transaction keeps historical reads and the replacement vote
// together. A failed statement must never be followed by DELETE or COMMIT.
// This is the same Hrana batch shape used by @libsql/client's write batches.
async function writeFeedback(statements: Statement[]): Promise<void> {
  const steps: BatchStep[] = [{ stmt: { sql: 'BEGIN IMMEDIATE' } }]
  for (const stmt of statements) {
    steps.push({ stmt, condition: { type: 'ok', step: steps.length - 1 } })
  }
  const commitStep = steps.length
  steps.push({ stmt: { sql: 'COMMIT' }, condition: { type: 'ok', step: commitStep - 1 } })
  steps.push({ stmt: { sql: 'ROLLBACK' }, condition: { type: 'not', cond: { type: 'ok', step: commitStep } } })

  const url = (process.env['TURSO_DATABASE_URL'] ?? '').replace('libsql://', 'https://')
  const token = process.env['TURSO_AUTH_TOKEN'] ?? ''
  const res = await fetch(`${url}/v2/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ type: 'batch', batch: { steps } }, { type: 'close' }] }),
  })
  if (!res.ok) throw new Error(`Turso pipeline HTTP ${res.status}: ${await res.text()}`)
  const body = (await res.json()) as TursoPipelineResponse
  const item = body.results[0]
  if (!item || item.type === 'error') throw new Error(item?.error?.message ?? 'Missing Turso batch result')
  const result = item.response?.result
  const error = result?.step_errors.find((e) => e !== null)
  if (error) throw new Error(error.message)
  if (!result?.step_results[commitStep]) throw new Error('Feedback transaction did not commit')
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const deviceId = req.headers.get('X-Device-Id')
  if (!deviceId) return jsonResponse({ ok: false, error: 'missing_device_id' }, 400)

  let articleId: string
  let signal: 'up' | 'down' | 'read' | 'clear'
  try {
    const body = (await req.json()) as { articleId?: unknown; signal?: unknown }
    if (typeof body.articleId !== 'string' || !/^[a-f0-9]{16}$/.test(body.articleId)) {
      return jsonResponse({ ok: false, error: 'invalid_article_id' }, 400)
    }
    if (body.signal !== 'up' && body.signal !== 'down' && body.signal !== 'read' && body.signal !== 'clear') {
      return jsonResponse({ ok: false, error: 'invalid_signal' }, 400)
    }
    articleId = body.articleId
    signal = body.signal
  } catch {
    return jsonResponse({ ok: false, error: 'invalid_body' }, 400)
  }

  try {
    const now = Math.floor(Date.now() / 1000)
    const statements: Statement[] = []
    if (signal !== 'read') {
      // Legacy votes are the only evidence of reading on their original day.
      // Preserve those days before changing/clearing preferences; no bulk
      // migration is needed, and undo never undoes an actual read.
      statements.push({
        sql: `INSERT INTO feedback (article_id, signal, device_id, created_at)
              SELECT f.article_id, 'read', f.device_id, min(f.created_at)
              FROM feedback f
              WHERE f.article_id = ? AND f.device_id = ? AND f.signal IN ('up', 'down')
                AND NOT EXISTS (
                  SELECT 1 FROM feedback r
                  WHERE r.article_id = f.article_id AND r.device_id = f.device_id AND r.signal = 'read'
                    AND date(r.created_at, 'unixepoch', '+8 hours') = date(f.created_at, 'unixepoch', '+8 hours')
                )
              GROUP BY f.article_id, f.device_id, date(f.created_at, 'unixepoch', '+8 hours')`,
        args: [text(articleId), text(deviceId)],
      })
    }
    if (signal !== 'clear') {
      // Server time, not brief date: revisiting an old brief still counts today.
      const start = Math.floor((now + 8 * 3600) / 86400) * 86400 - 8 * 3600
      statements.push({
        sql: `INSERT INTO feedback (article_id, signal, device_id, created_at)
              SELECT ?, 'read', ?, ?
              WHERE NOT EXISTS (
                SELECT 1 FROM feedback WHERE article_id = ? AND device_id = ? AND signal = 'read'
                  AND created_at >= ? AND created_at < ?
              )`,
        args: [text(articleId), text(deviceId), int(now), text(articleId), text(deviceId), int(start), int(start + 86400)],
      })
    }
    if (signal !== 'read') {
      statements.push({
        sql: "DELETE FROM feedback WHERE article_id = ? AND device_id = ? AND signal IN ('up', 'down')",
        args: [text(articleId), text(deviceId)],
      })
      if (signal !== 'clear') {
        statements.push({
          sql: 'INSERT INTO feedback (article_id, signal, device_id, created_at) VALUES (?, ?, ?, ?)',
          args: [text(articleId), text(signal), text(deviceId), int(now)],
        })
      }
    }
    await writeFeedback(statements)
    return jsonResponse({ ok: true })
  } catch (err) {
    console.error('[feedback] Failed:', err)
    return jsonResponse({ ok: false, error: 'server_error' }, 500)
  }
}
