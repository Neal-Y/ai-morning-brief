export const config = { runtime: 'edge' }

// POST /api/quiz-report { quizId, reason } — flag a flawed question.
//
// The quiz_reports table is created here on demand (CREATE TABLE IF NOT
// EXISTS, same shape as src/db/schema.ts quizReports) instead of via a manual
// migration: columns/tables that only exist in schema.ts and were never
// migrated have 500'd this app before (saves.deleted_at, see KNOWN_ISSUES).
// Readers (/api/quiz, the quiz pipeline) treat a missing table as "none".
// One report per (quiz, device); re-reporting just updates the reason.

const REASONS = new Set(['wrong_answer', 'unclear', 'too_easy', 'other'])

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS quiz_reports (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  quiz_id integer NOT NULL,
  device_id text,
  reason text NOT NULL,
  created_at integer NOT NULL,
  CONSTRAINT quiz_reports_quiz_id_device_id_unique UNIQUE(quiz_id, device_id)
)`

interface TursoPipelineResponse {
  results: Array<{ type: 'ok' | 'error'; error?: { message: string } }>
}

async function tursoPipeline(requests: unknown[]): Promise<void> {
  const url = (process.env['TURSO_DATABASE_URL'] ?? '').replace('libsql://', 'https://')
  const token = process.env['TURSO_AUTH_TOKEN'] ?? ''
  const res = await fetch(`${url}/v2/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [...requests, { type: 'close' }] }),
  })
  if (!res.ok) throw new Error(`Turso pipeline HTTP ${res.status}: ${await res.text()}`)
  const json = (await res.json()) as TursoPipelineResponse
  for (const item of json.results) {
    if (item.type === 'error') throw new Error(`Turso pipeline item error: ${item.error?.message ?? 'unknown'}`)
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const deviceId = req.headers.get('X-Device-Id')
  if (!deviceId) return jsonResponse({ ok: false, error: 'missing_device_id' }, 400)

  let quizId: number
  let reason: string
  try {
    const body = (await req.json()) as { quizId?: unknown; reason?: unknown }
    if (typeof body.quizId !== 'number' || !Number.isInteger(body.quizId)) {
      return jsonResponse({ ok: false, error: 'invalid_quiz_id' }, 400)
    }
    if (typeof body.reason !== 'string' || !REASONS.has(body.reason)) {
      return jsonResponse({ ok: false, error: 'invalid_reason' }, 400)
    }
    quizId = body.quizId
    reason = body.reason
  } catch {
    return jsonResponse({ ok: false, error: 'invalid_body' }, 400)
  }

  try {
    await tursoPipeline([
      { type: 'execute', stmt: { sql: CREATE_TABLE } },
      {
        type: 'execute',
        stmt: {
          sql: `INSERT INTO quiz_reports (quiz_id, device_id, reason, created_at) VALUES (?, ?, ?, ?)
                ON CONFLICT(quiz_id, device_id) DO UPDATE SET reason = excluded.reason, created_at = excluded.created_at`,
          args: [
            { type: 'integer', value: String(quizId) },
            { type: 'text', value: deviceId },
            { type: 'text', value: reason },
            { type: 'integer', value: String(Math.floor(Date.now() / 1000)) },
          ],
        },
      },
    ])
    return jsonResponse({ ok: true })
  } catch (err) {
    console.error('[quiz-report] Failed:', err)
    return jsonResponse({ ok: false, error: 'server_error' }, 500)
  }
}
