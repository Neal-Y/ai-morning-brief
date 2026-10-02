import { createClient, type Client } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../../api/weekly.js'
import { sqliteTursoFetch } from './turso.js'

const NOW = Date.parse('2026-10-02T02:00:00Z')
const DAY = 86400
const at = Math.floor(NOW / 1000)
let db: Client

const questions = [
  { type: 'single_choice', payload: { options: ['A', 'B', 'C', 'D'], correctIndex: 1 } },
  { type: 'ordering', payload: { items: ['確認影響', '限流', '修復'] } },
  { type: 'matching', payload: { left: ['超時', '爭用', '過期'], right: ['退避', '鎖', 'Jitter'] } },
  { type: 'fill_blank', payload: { template: '使用 {{0}} 分散到期時間。', blanks: ['Jitter'], wordBank: ['Jitter', 'Retry'] } },
]

beforeEach(async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  db = createClient({ url: 'file::memory:' })
  await db.executeMultiple(`
    CREATE TABLE quizzes (id INTEGER PRIMARY KEY, category TEXT, prompt TEXT, type TEXT, payload TEXT, explanation TEXT);
    CREATE TABLE quiz_attempts (quiz_id INTEGER, device_id TEXT, correct INTEGER, answered_at INTEGER);
    CREATE TABLE feedback (article_id TEXT, device_id TEXT, signal TEXT, created_at INTEGER);
    CREATE TABLE articles (id TEXT PRIMARY KEY, title TEXT);
    CREATE TABLE saves (article_id TEXT, device_id TEXT, created_at INTEGER);
  `)
  vi.stubGlobal('fetch', sqliteTursoFetch(db))
  for (let id = 1; id <= 9; id++) {
    const question = questions[(id - 1) % questions.length]!
    await db.execute({
      sql: 'INSERT INTO quizzes VALUES (?, ?, ?, ?, ?, ?)',
      args: [id, 'CACHING', `題目 ${id}`, question.type, JSON.stringify(question.payload), `解析 ${id}`],
    })
  }
})

afterEach(() => {
  db.close()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function weekly() {
  const response = await handler(new Request('https://example.test/api/weekly', { headers: { 'X-Device-Id': 'mine' } }))
  expect(response.status).toBe(200)
  return response.json() as Promise<{
    read: number; answered: number; activeDays: number
    missed: { quizId: number; prompt: string; question?: { type: string; payload: unknown; explanation: string } }[]
  }>
}

describe('weekly read-only quiz review', () => {
  it('returns answer payloads for at most five distinct misses, scoped to this device and week', async () => {
    for (let id = 1; id <= 7; id++) {
      await db.execute({ sql: 'INSERT INTO quiz_attempts VALUES (?, ?, ?, ?)', args: [id, 'mine', 0, at - 100 + id] })
    }
    await db.executeMultiple(`
      INSERT INTO quiz_attempts VALUES (7, 'mine', 0, ${at});
      INSERT INTO quiz_attempts VALUES (8, 'mine', 1, ${at + 1});
      INSERT INTO quiz_attempts VALUES (9, 'other', 0, ${at + 2});
      INSERT INTO quiz_attempts VALUES (9, 'mine', 0, ${at - 7 * DAY});
    `)
    const before = await db.execute('SELECT count(*) AS n FROM quiz_attempts')
    const data = await weekly()
    expect(data.missed.map(q => q.quizId)).toEqual([7, 6, 5, 4, 3])
    expect(new Set(data.missed.map(q => q.question?.type))).toEqual(new Set(questions.map(q => q.type)))
    for (const item of data.missed) {
      expect(item.question?.payload).toEqual(questions[(item.quizId - 1) % questions.length]!.payload)
      expect(item.question?.explanation).toBe(`解析 ${item.quizId}`)
    }
    expect(data.missed.find(q => q.quizId === 4)?.prompt).toBe('使用 ＿＿ 分散到期時間。')
    expect(data.answered).toBe(9)
    expect((await db.execute('SELECT count(*) AS n FROM quiz_attempts')).rows).toEqual(before.rows)
  })

  it('counts a neutral read and a vote on the same article once per Taipei day', async () => {
    await db.executeMultiple(`
      INSERT INTO feedback VALUES ('a', 'mine', 'read', ${at});
      INSERT INTO feedback VALUES ('a', 'mine', 'up', ${at + 1});
      INSERT INTO feedback VALUES ('a', 'mine', 'read', ${at - DAY});
      INSERT INTO feedback VALUES ('b', 'mine', 'down', ${at});
      INSERT INTO feedback VALUES ('c', 'other', 'read', ${at});
      INSERT INTO feedback VALUES ('d', 'mine', 'read', ${at - 7 * DAY});
    `)
    const data = await weekly()
    expect(data.read).toBe(3)
    expect(data.activeDays).toBe(2)
  })

  it('keeps a malformed historical question visible without failing the weekly review', async () => {
    await db.execute("UPDATE quizzes SET payload = '{invalid' WHERE id = 1")
    await db.execute({ sql: 'INSERT INTO quiz_attempts VALUES (?, ?, ?, ?)', args: [1, 'mine', 0, at] })
    const data = await weekly()
    expect(data.missed).toEqual([{ quizId: 1, category: 'CACHING', prompt: '題目 1' }])
  })
})
