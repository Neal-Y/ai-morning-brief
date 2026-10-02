import type { Client } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import feedback from '../../api/feedback.js'
import activity from '../../api/activity.js'
import { createReadingDatabase, sqliteTursoFetch } from './turso.js'

const articleId = '0123456789abcdef'
const deviceId = 'reading-device'
const today = Date.parse('2026-10-02T15:59:00Z') // 23:59 Taipei
const yesterday = today - 86400_000
let db: Client

function post(signal: string, device = deviceId) {
  return feedback(new Request('https://sift.test/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Id': device },
    body: JSON.stringify({ articleId, signal, date: '1999-01-01' }),
  }))
}
async function rows() {
  return (await db.execute('SELECT article_id, signal, device_id, created_at FROM feedback ORDER BY created_at, id')).rows
}
async function seedVote(signal: 'up' | 'down', timestamp = yesterday) {
  await db.execute({ sql: 'INSERT INTO feedback (article_id, signal, device_id, created_at) VALUES (?, ?, ?, ?)',
    args: [articleId, signal, deviceId, Math.floor(timestamp / 1000)] })
}

beforeEach(async () => {
  db = await createReadingDatabase()
  await db.execute({ sql: 'INSERT INTO articles VALUES (?, ?, ?)', args: [articleId, 'Test article', 'AI'] })
  vi.spyOn(Date, 'now').mockReturnValue(today)
  vi.stubGlobal('fetch', sqliteTursoFetch(db))
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  db.close()
})

describe('reading and preferences', () => {
  it('records concurrent/repeated neutral reads once per device and Taipei day using server time', async () => {
    const responses = await Promise.all([post('read'), post('read'), post('read')])
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200])
    expect(await rows()).toEqual([{ article_id: articleId, signal: 'read', device_id: deviceId, created_at: today / 1000 }])

    vi.mocked(Date.now).mockReturnValue(today + 120_000) // Same UTC day; next Taipei day.
    expect((await post('read')).status).toBe(200)
    expect((await post('read', 'second-device')).status).toBe(200)
    expect(await rows()).toHaveLength(3)
    const response = await activity(new Request('https://sift.test/api/activity', { headers: { 'X-Device-Id': deviceId } }))
    expect(await response.json()).toMatchObject({ streak: 2, activeToday: true })
  })

  it('keeps one reading through vote changes and undo, without double-counting heatmap activity', async () => {
    for (const signal of ['read', 'up', 'down']) expect((await post(signal)).status).toBe(200)
    // Mimic a historical duplicate vote. Even three DB rows mean one read.
    await seedVote('down', today)
    const response = await activity(new Request('https://sift.test/api/activity', { headers: { 'X-Device-Id': deviceId } }))
    const result = await response.json() as { heatmap: number[][] }
    expect(result.heatmap[51]?.[4]).toBe(1) // Friday; count=3 would produce intensity 2.
    expect((await post('clear')).status).toBe(200)
    expect(await rows()).toEqual([{ article_id: articleId, signal: 'read', device_id: deviceId, created_at: today / 1000 }])
  })

  it('neutral reads preserve an existing preference', async () => {
    await seedVote('up')
    expect((await post('read')).status).toBe(200)
    expect((await rows()).map((row) => row.signal)).toEqual(['up', 'read'])
  })

  it.each(['clear', 'down'])('preserves historical read days when a legacy vote is changed with %s', async (signal) => {
    await seedVote('up')
    await seedVote('up') // Older duplicates also collapse to one daily read.
    expect((await post(signal)).status).toBe(200)
    expect((await rows()).filter((row) => row.signal === 'read').map((row) => row.created_at))
      .toEqual(signal === 'clear' ? [yesterday / 1000] : [yesterday / 1000, today / 1000])
    const response = await activity(new Request('https://sift.test/api/activity', { headers: { 'X-Device-Id': deviceId } }))
    expect(await response.json()).toMatchObject(signal === 'clear'
      ? { streak: 1, activeToday: false } : { streak: 2, activeToday: true })
  })

  it.each(['read', 'down'])('preserves the legacy vote when writing %s fails inside the transaction', async (failedSignal) => {
    await seedVote('up')
    await db.execute(`CREATE TRIGGER reject_write BEFORE INSERT ON feedback WHEN NEW.signal = '${failedSignal}'
                      BEGIN SELECT RAISE(ABORT, 'injected write failure'); END`)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await post('down')).status).toBe(500)
    expect(await rows()).toEqual([{ article_id: articleId, signal: 'up', device_id: deviceId, created_at: yesterday / 1000 }])
    await db.execute('DROP TRIGGER reject_write')
    expect((await post('read')).status).toBe(200) // Connection is usable after rollback.
  })
})
