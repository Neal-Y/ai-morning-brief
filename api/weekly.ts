export const config = { runtime: 'edge' }

// GET /api/weekly — this week's review for the Activity page (2026-09-30).
//
// Edge + one Turso pipeline round trip (three statements) rather than a Hono
// route: the Activity tab should open instantly, and the Node function's cold
// start is exactly the latency users notice. Week = Monday 00:00 Taipei → now;
// "last week" is the seven days before that, for the accuracy comparison.

const DAY_MS = 86400_000
const TZ_MS = 8 * 60 * 60 * 1000

interface TursoCell { type: string; value?: string }
interface TursoResult { cols: { name: string }[]; rows: TursoCell[][] }
interface TursoPipelineResponse {
  results: Array<
    | { type: 'ok'; response: { type: string; result?: TursoResult } }
    | { type: 'error'; error: { message: string } }
  >
}

async function query(statements: { sql: string; args: unknown[] }[]): Promise<Record<string, string | null>[][]> {
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
      const obj: Record<string, string | null> = {}
      result.cols.forEach((c, j) => {
        const cell = row[j]
        obj[c.name] = !cell || cell.type === 'null' ? null : cell.value ?? null
      })
      return obj
    })
  })
}

const text = (v: string) => ({ type: 'text', value: v })

// Fill-blank and matching prompts are generic instructions (「請填入正確術語完成
// 以下句子：」), useless as a reminder of *which* question was missed. Show the
// sentence / the pairs' left side instead.
function describe(a: Record<string, string | null>): string {
  const prompt = a['prompt'] ?? ''
  try {
    const p = JSON.parse(a['payload'] ?? '{}') as Record<string, unknown>
    if (a['type'] === 'fill_blank' && typeof p['template'] === 'string') {
      return p['template'].replace(/\{\{\d+\}\}/g, '＿＿')
    }
    if (a['type'] === 'matching' && Array.isArray(p['left'])) {
      return `${prompt.replace(/[：:]\s*$/, '')}：${(p['left'] as unknown[]).filter(x => typeof x === 'string').join('、')}`
    }
  } catch { /* fall back to the prompt */ }
  return prompt
}

// Only the five displayed misses get their answer material in the response.
// Keep the existing prompt summary for old clients and the compact list row.
function questionForReview(a: Record<string, string | null>) {
  try {
    const payload: unknown = JSON.parse(a['payload'] ?? '{}')
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined
    return {
      id: Number(a['quiz_id']),
      type: a['type'] ?? '',
      category: a['category'] ?? '',
      prompt: a['prompt'] ?? '',
      payload,
      explanation: a['explanation'] ?? '',
      sourceName: null,
      sourceUrl: null,
    }
  } catch {
    return undefined
  }
}
const int = (n: number) => ({ type: 'integer', value: String(n) })

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405 })
  const deviceId = req.headers.get('X-Device-Id')
  if (!deviceId) return jsonResponse({ ok: false, error: 'missing_device_id' }, 400)

  // Monday 00:00 Taipei, as a UTC instant.
  const nowMs = Date.now()
  const taipeiNow = new Date(nowMs + TZ_MS)
  const dow = taipeiNow.getUTCDay() // 0 = Sunday
  const daysFromMon = dow === 0 ? 6 : dow - 1
  const todayMidnightTaipei = Date.UTC(taipeiNow.getUTCFullYear(), taipeiNow.getUTCMonth(), taipeiNow.getUTCDate()) - TZ_MS
  const weekStartMs = todayMidnightTaipei - daysFromMon * DAY_MS
  const lastWeekStartMs = weekStartMs - 7 * DAY_MS
  const weekStart = Math.floor(weekStartMs / 1000)
  const lastWeekStart = Math.floor(lastWeekStartMs / 1000)

  try {
    const [attempts = [], reads = [], saved = []] = await query([
      {
        // Two weeks of attempts is small (≤ ~70 rows at 5/day); the cap is a guard.
        sql: `SELECT qa.quiz_id, qa.correct, qa.answered_at, q.category, q.prompt, q.type, q.payload, q.explanation
              FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id
              WHERE qa.device_id = ? AND qa.answered_at >= ?
              ORDER BY qa.answered_at DESC LIMIT 500`,
        args: [text(deviceId), int(lastWeekStart)],
      },
      {
        sql: `SELECT date(created_at, 'unixepoch', '+8 hours') AS day, count(DISTINCT article_id) AS n
              FROM feedback WHERE device_id = ? AND created_at >= ? GROUP BY day`,
        args: [text(deviceId), int(weekStart)],
      },
      {
        sql: `SELECT a.id, a.title FROM saves s JOIN articles a ON a.id = s.article_id
              WHERE s.device_id = ? AND s.created_at >= ?
              ORDER BY s.created_at DESC LIMIT 5`,
        args: [text(deviceId), int(weekStart)],
      },
    ])

    const thisWeek = attempts.filter((a) => Number(a['answered_at']) >= weekStart)
    const lastWeek = attempts.filter((a) => Number(a['answered_at']) < weekStart)
    const isCorrect = (a: Record<string, string | null>) => a['correct'] === '1'

    // Weakest areas: categories with the most misses this week.
    const byCat = new Map<string, { wrong: number; total: number }>()
    for (const a of thisWeek) {
      const cat = a['category'] ?? ''
      const c = byCat.get(cat) ?? { wrong: 0, total: 0 }
      c.total++
      if (!isCorrect(a)) c.wrong++
      byCat.set(cat, c)
    }
    const weakCategories = [...byCat.entries()]
      .filter(([, c]) => c.wrong > 0)
      .sort((x, y) => y[1].wrong - x[1].wrong || x[1].total - y[1].total)
      .slice(0, 3)
      .map(([category, c]) => ({ category, wrong: c.wrong, total: c.total }))

    // Distinct questions missed this week, newest first (they're also what the
    // spaced-review schedule will bring back).
    const seen = new Set<string>()
    const missed: {
      quizId: number; category: string; prompt: string; question: ReturnType<typeof questionForReview>
    }[] = []
    for (const a of thisWeek) {
      const id = a['quiz_id'] ?? ''
      if (isCorrect(a) || seen.has(id)) continue
      seen.add(id)
      missed.push({
        quizId: Number(id), category: a['category'] ?? '', prompt: describe(a),
        question: questionForReview(a),
      })
      if (missed.length === 5) break
    }

    const quizDays = new Set(thisWeek.map((a) => new Date(Number(a['answered_at']) * 1000 + TZ_MS).toISOString().slice(0, 10)))
    const readDays = new Set(reads.map((r) => r['day'] ?? ''))
    const activeDays = new Set([...quizDays, ...readDays]).size

    const label = (ms: number) => {
      const d = new Date(ms + TZ_MS)
      return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
    }

    return jsonResponse({
      weekLabel: `${label(weekStartMs)} – ${label(weekStartMs + 6 * DAY_MS)}`,
      daysElapsed: daysFromMon + 1,
      activeDays,
      read: reads.reduce((sum, r) => sum + Number(r['n'] ?? 0), 0),
      answered: thisWeek.length,
      correct: thisWeek.filter(isCorrect).length,
      lastWeek: { answered: lastWeek.length, correct: lastWeek.filter(isCorrect).length },
      weakCategories,
      missed,
      saved: saved.map((s) => ({ id: s['id'] ?? '', title: s['title'] ?? '' })),
    })
  } catch (err) {
    console.error('[weekly] query failed:', err)
    return jsonResponse({ ok: false, error: 'server_error' }, 500)
  }
}
