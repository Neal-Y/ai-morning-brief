import { createClient, type Client } from '@libsql/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import handler from '../../api/quiz.js'
import { sqliteTursoFetch } from './turso.js'

const NOW = Date.parse('2026-10-02T02:00:00Z')
const DAY = 86400
let db: Client

beforeEach(async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  db = createClient({ url: 'file::memory:' })
  await db.executeMultiple(`
    CREATE TABLE quizzes (id INTEGER PRIMARY KEY, type TEXT, category TEXT, prompt TEXT, payload TEXT,
      explanation TEXT, source_name TEXT, source_url TEXT, created_at INTEGER);
    CREATE TABLE quiz_attempts (quiz_id INTEGER, device_id TEXT, correct INTEGER, answered_at INTEGER);
    CREATE TABLE quiz_reports (quiz_id INTEGER, device_id TEXT, reason TEXT, created_at INTEGER);
  `)
  vi.stubGlobal('fetch', sqliteTursoFetch(db))
  const payload = JSON.stringify({ options: ['A', 'B', 'C', 'D'], correctIndex: 0 })
  for (let id = 1; id <= 12; id++) {
    await db.execute({
      sql: 'INSERT INTO quizzes VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?)',
      args: [id, 'single_choice', 'DB', `Q${id}`, payload, 'E', NOW / 1000 - id * DAY],
    })
  }
})

afterEach(() => {
  db.close()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('a due review is still served when the six most overdue misses were all reported', async () => {
  // Quizzes 1–7 were missed long enough ago to be due; 1–6 are the most overdue.
  for (let id = 1; id <= 7; id++) {
    await db.execute({
      sql: 'INSERT INTO quiz_attempts VALUES (?, ?, 0, ?)',
      args: [id, 'me', NOW / 1000 - (20 - id) * DAY],
    })
  }
  for (let id = 1; id <= 6; id++) {
    await db.execute({ sql: 'INSERT INTO quiz_reports VALUES (?, ?, ?, ?)', args: [id, 'other', 'unclear', NOW / 1000] })
  }

  const res = await handler(new Request('https://x/api/quiz?count=5', { headers: { 'X-Device-Id': 'me' } }))
  const { quizzes } = await res.json() as { quizzes: { id: number; review: boolean }[] }

  expect(quizzes.filter((q) => q.review).map((q) => q.id)).toEqual([7])
  expect(quizzes.some((q) => q.id <= 6)).toBe(false)
})
