import { computeStreak, taipeiDateString } from '../src/streak.js'

export const config = { runtime: 'edge' }

// GET /api/activity — the Activity page: streak, heatmap, this week, recent days.
//
// Edge + one Turso pipeline round trip (2026-10-01), replacing the Hono/Node
// route (cold start). Logic and response shape are unchanged:
//   - a day counts toward streak + heatmap if the device read (any feedback
//     row) OR answered a quiz that day — one streak for the whole app
//   - weekStats and recent describe answers only (quiz_attempts)
//   - totalCorrect / totalAnswered are all-time

const DAY_MS = 86400_000
const TZ_MS = 8 * 60 * 60 * 1000
const LOOKBACK_DAYS = 400 // > 52 weeks of heatmap, and enough for any streak

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

const WEEKDAY_ZH = ['日', '一', '二', '三', '四', '五', '六']

// YYYY-MM-DD (Taipei) → "7/5 (六)"
function formatDayLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(Date.UTC(year!, month! - 1, day!, 4)) // noon Taipei = 04:00 UTC
  return `${month}/${day} (${WEEKDAY_ZH[d.getUTCDay()]})`
}

// 52 cols × 7 rows (col 0 = oldest week, col 51 = this week; row 0 = Monday).
function buildHeatmap(dayCounts: Map<string, number>, taipeiMs: number): number[][] {
  const dow = new Date(taipeiMs).getUTCDay()
  const daysFromMon = dow === 0 ? 6 : dow - 1
  const gridStartMs = taipeiMs - (daysFromMon + 51 * 7) * DAY_MS
  const grid: number[][] = Array.from({ length: 52 }, () => Array(7).fill(0))
  for (let col = 0; col < 52; col++) {
    for (let row = 0; row < 7; row++) {
      const dateStr = new Date(gridStartMs + (col * 7 + row) * DAY_MS).toISOString().slice(0, 10)
      const count = dayCounts.get(dateStr) ?? 0
      grid[col]![row] = count === 0 ? 0 : count <= 2 ? 1 : count <= 4 ? 2 : 3
    }
  }
  return grid
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405 })

  const deviceId = req.headers.get('X-Device-Id')
  if (!deviceId) {
    return jsonResponse({
      streak: 0, activeToday: false, totalCorrect: 0, totalAnswered: 0,
      weekStats: { correct: 0, wrong: 0, total: 0 },
      heatmap: Array.from({ length: 52 }, () => Array(7).fill(0)),
      recent: [],
    })
  }

  const nowMs = Date.now()
  const cutoff = Math.floor((nowMs - LOOKBACK_DAYS * DAY_MS) / 1000)

  try {
    const [rows = [], readRows = [], totals = []] = await query([
      {
        sql: `SELECT date(qa.answered_at, 'unixepoch', '+8 hours') AS day, q.category, qa.correct
              FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id
              WHERE qa.device_id = ? AND qa.answered_at >= ?
              ORDER BY day DESC`,
        args: [text(deviceId), int(cutoff)],
      },
      {
        sql: `SELECT date(created_at, 'unixepoch', '+8 hours') AS day, count(*) AS n
              FROM feedback WHERE device_id = ? AND created_at >= ? GROUP BY day`,
        args: [text(deviceId), int(cutoff)],
      },
      {
        sql: `SELECT sum(CASE WHEN correct THEN 1 ELSE 0 END) AS correct, count(*) AS total
              FROM quiz_attempts WHERE device_id = ?`,
        args: [text(deviceId)],
      },
    ])
    const quiz = rows.map((r) => ({ day: r['day'] ?? '', category: r['category'] ?? '', correct: r['correct'] === '1' }))
    const reads = readRows.map((r) => ({ day: r['day'] ?? '', n: Number(r['n'] ?? 0) }))
    const totalCorrect = Number(totals[0]?.['correct'] ?? 0)
    const totalAnswered = Number(totals[0]?.['total'] ?? 0)

    // streak
    const days = [...new Set([...quiz.map((r) => r.day), ...reads.map((r) => r.day)])].sort().reverse()
    const streak = computeStreak(days, nowMs)
    const activeToday = days[0] === taipeiDateString(nowMs)

    // this week (Mon → today, Taipei), answers only
    const taipeiMs = nowMs + TZ_MS
    const dow = new Date(taipeiMs).getUTCDay()
    const weekStartStr = new Date(taipeiMs - (dow === 0 ? 6 : dow - 1) * DAY_MS).toISOString().slice(0, 10)
    const weekRows = quiz.filter((r) => r.day >= weekStartStr)
    const weekCorrect = weekRows.filter((r) => r.correct).length
    const weekWrong = weekRows.length - weekCorrect

    // heatmap: answers + reads per day
    const dayCounts = new Map<string, number>()
    for (const r of quiz) dayCounts.set(r.day, (dayCounts.get(r.day) ?? 0) + 1)
    for (const r of reads) dayCounts.set(r.day, (dayCounts.get(r.day) ?? 0) + r.n)
    const heatmap = buildHeatmap(dayCounts, taipeiMs)

    // recent: last 5 days with answers
    const byDay = new Map<string, { cats: Map<string, number>; correct: number; total: number }>()
    for (const r of quiz) {
      let d = byDay.get(r.day)
      if (!d) byDay.set(r.day, d = { cats: new Map(), correct: 0, total: 0 })
      d.cats.set(r.category, (d.cats.get(r.category) ?? 0) + 1)
      if (r.correct) d.correct++
      d.total++
    }
    const recent = [...byDay.keys()].sort().reverse().slice(0, 5).map((day) => {
      const d = byDay.get(day)!
      const topCat = [...d.cats.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
      // "TOP +N": a day's answers usually span several categories; the bare top
      // one read as if every question that day was in it.
      const others = d.cats.size - 1
      return { date: formatDayLabel(day), category: others > 0 ? `${topCat} +${others}` : topCat, correct: d.correct, total: d.total }
    })

    return jsonResponse({
      streak, activeToday, totalCorrect, totalAnswered,
      weekStats: { correct: weekCorrect, wrong: weekWrong, total: weekCorrect + weekWrong },
      heatmap, recent,
    })
  } catch (err) {
    console.error('[activity] query failed:', err)
    return jsonResponse({ ok: false, error: 'server_error' }, 500)
  }
}
