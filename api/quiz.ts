import { dueReviewIds, REVIEW_MAX_PER_SET } from '../src/quiz/review.js'

export const config = { runtime: 'edge' }

// GET /api/quiz[?count=N&type=a,b] — today's quiz set for this device.
//
// Edge + raw Turso SQL (2026-10-01), replacing the last Hono/Node route so the
// app has no Node cold start anywhere. Two pipeline round trips:
//   1. reported ids + this device's attempts (spaced review needs the history)
//   2. due reviews, fresh questions and a recycle pool, all in one go
// Selection is unchanged from the Hono version:
//   - reported questions (quiz_reports) are out for everyone; the table is
//     created lazily by api/quiz-report.ts, so "no such table" = none reported
//   - up to REVIEW_MAX_PER_SET missed questions that are due again
//     (src/quiz/review.ts), then unseen questions newest first
//   - if that's still short, recycle already-answered ones newest first
// Response shape is identical: { quizzes: [{ id, type, category, prompt,
// payload, explanation, sourceName, sourceUrl, review }] }.

interface TursoCell { type: string; value?: string }
interface TursoResult { cols: { name: string }[]; rows: TursoCell[][] }
type TursoStatementResult =
  | { type: 'ok'; response: { type: string; result?: TursoResult } }
  | { type: 'error'; error: { message: string } }
interface TursoPipelineResponse { results: TursoStatementResult[] }

type Row = Record<string, string | null>
type Stmt = { sql: string; args: unknown[] }

/** Per-statement results; a failed statement comes back as an Error instead of throwing. */
async function querySettled(statements: Stmt[]): Promise<(Row[] | Error)[]> {
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
    if (!r) return new Error('Turso query error: no result')
    if (r.type === 'error') return new Error(`Turso query error: ${r.error.message}`)
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

function ok(r: Row[] | Error | undefined): Row[] {
  if (r instanceof Error) throw r
  return r ?? []
}

const text = (v: string) => ({ type: 'text', value: v })
const int = (n: number) => ({ type: 'integer', value: String(n) })
const placeholders = (n: number) => Array(n).fill('?').join(', ')

const MAX_QUIZ_COUNT = 20
const QUIZ_COLUMNS = 'id, type, category, prompt, payload, explanation, source_name, source_url'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    // Reflects per-device attempt history, so never cache at the edge.
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405 })

  const params = new URL(req.url).searchParams
  const countParam = Math.floor(Number(params.get('count') ?? '5'))
  const count = Number.isFinite(countParam) && countParam > 0 ? Math.min(countParam, MAX_QUIZ_COUNT) : 5
  // `type` accepts a single value or a comma list so the client can request
  // only the types it can render.
  const types = (params.get('type') ?? '').split(',').map((t) => t.trim()).filter(Boolean)
  const deviceId = req.headers.get('X-Device-Id')

  try {
    // ── round 1: reported ids + attempt history ──────────────────────────────
    const round1: Stmt[] = [{ sql: 'SELECT DISTINCT quiz_id FROM quiz_reports', args: [] }]
    if (deviceId) {
      round1.push({
        sql: 'SELECT quiz_id, correct, answered_at FROM quiz_attempts WHERE device_id = ?',
        args: [text(deviceId)],
      })
    }
    const [reportedRes = [], attemptRes] = await querySettled(round1)
    let reportedIds: number[] = []
    if (reportedRes instanceof Error) {
      if (!/no such table/i.test(reportedRes.message)) throw reportedRes
    } else {
      reportedIds = reportedRes.map((r) => Number(r['quiz_id']))
    }
    const attempts = (deviceId ? ok(attemptRes) : []).map((r) => ({
      quizId: Number(r['quiz_id']),
      correct: r['correct'] === '1',
      answeredAt: new Date(Number(r['answered_at']) * 1000),
    }))
    const attemptedIds = [...new Set(attempts.map((a) => a.quizId))]
    const reviewIds = dueReviewIds(attempts)

    // Shared WHERE fragment: type filter + not reported.
    const baseWhere: string[] = []
    const baseArgs: unknown[] = []
    if (types.length > 0) {
      baseWhere.push(`type IN (${placeholders(types.length)})`)
      baseArgs.push(...types.map(text))
    }
    if (reportedIds.length > 0) {
      baseWhere.push(`id NOT IN (${placeholders(reportedIds.length)})`)
      baseArgs.push(...reportedIds.map(int))
    }
    const where = (extra: string[], extraArgs: unknown[]): Stmt => {
      const clauses = [...baseWhere, ...extra]
      return {
        sql: clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '',
        args: [...baseArgs, ...extraArgs],
      }
    }

    // ── round 2: reviews, fresh, recycle pool ────────────────────────────────
    const reviewCap = Math.min(REVIEW_MAX_PER_SET, count)
    const candidates = reviewIds.slice(0, reviewCap * 3) // headroom for the type filter
    const attemptedArgs = attemptedIds.map(int)

    const round2: Stmt[] = []
    let reviewIdx = -1, freshIdx = -1, recycleIdx = -1
    if (candidates.length > 0 && reviewCap > 0) {
      const w = where([`id IN (${placeholders(candidates.length)})`], candidates.map(int))
      reviewIdx = round2.push({ sql: `SELECT ${QUIZ_COLUMNS} FROM quizzes${w.sql}`, args: w.args }) - 1
    }
    {
      // Fetch `count` unseen rows: reviews aren't known until this round
      // returns, and fresh is trimmed to `count - reviews` below.
      const w = attemptedIds.length > 0
        ? where([`id NOT IN (${placeholders(attemptedIds.length)})`], attemptedArgs)
        : where([], [])
      freshIdx = round2.push({
        sql: `SELECT ${QUIZ_COLUMNS} FROM quizzes${w.sql} ORDER BY created_at DESC LIMIT ?`,
        args: [...w.args, int(count)],
      }) - 1
    }
    if (attemptedIds.length > 0) {
      // Recycle pool: answered questions, newest first. Extra headroom because
      // the chosen reviews are filtered out of it below.
      const w = where([`id IN (${placeholders(attemptedIds.length)})`], attemptedArgs)
      recycleIdx = round2.push({
        sql: `SELECT ${QUIZ_COLUMNS} FROM quizzes${w.sql} ORDER BY created_at DESC LIMIT ?`,
        args: [...w.args, int(count + reviewCap)],
      }) - 1
    }
    const round2Res = await querySettled(round2)

    let reviews: Row[] = []
    if (reviewIdx >= 0) {
      const byId = new Map(ok(round2Res[reviewIdx]).map((r) => [Number(r['id']), r]))
      reviews = candidates.flatMap((id): Row[] => { const r = byId.get(id); return r ? [r] : [] }).slice(0, reviewCap)
    }
    const reviewSet = new Set(reviews.map((r) => Number(r['id'])))

    const fresh = ok(round2Res[freshIdx]).slice(0, count - reviews.length)
    let result = [...reviews, ...fresh]
    if (result.length < count && recycleIdx >= 0) {
      const recycled = ok(round2Res[recycleIdx])
        .filter((r) => !reviewSet.has(Number(r['id'])))
        .slice(0, count - result.length)
      result = [...result, ...recycled]
    }

    // Parse per-row and skip any malformed payload — one bad row must not 500
    // the whole set.
    const quizzes = result.flatMap((q) => {
      const id = Number(q['id'])
      let payload: unknown
      try {
        payload = JSON.parse(q['payload'] ?? '')
      } catch {
        console.warn(`[api/quiz] Skipping quiz ${id} — malformed payload JSON`)
        return []
      }
      return [{
        id,
        type: q['type'],
        category: q['category'],
        prompt: q['prompt'],
        payload,
        explanation: q['explanation'],
        sourceName: q['source_name'] ?? null,
        sourceUrl: q['source_url'] ?? null,
        review: reviewSet.has(id),
      }]
    })

    return jsonResponse({ quizzes })
  } catch (err) {
    console.error('[quiz] query failed:', err)
    return jsonResponse({ ok: false, error: 'server_error' }, 500)
  }
}
