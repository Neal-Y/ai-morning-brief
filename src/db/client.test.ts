import type { Client, Config } from '@libsql/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createReadingDatabase } from '../test/turso.js'

vi.mock('dotenv/config', () => ({}))
vi.mock('../notify/web-push.js', () => ({ sendWebPush: vi.fn() }))

const state = vi.hoisted(() => ({ client: undefined as Client | undefined }))
vi.mock('@libsql/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@libsql/client')>()
  return { ...actual, createClient: (config: Config) => state.client ?? actual.createClient(config) }
})

const now = Date.parse('2026-10-02T04:00:00Z')
let client: typeof import('./client.js')

beforeEach(async () => {
  vi.resetModules()
  vi.stubEnv('TURSO_DATABASE_URL', 'file::memory:')
  vi.spyOn(Date, 'now').mockReturnValue(now)
  state.client = await createReadingDatabase()
  client = await import('./client.js')
})
afterEach(() => {
  state.client?.close()
  state.client = undefined
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

async function add(signal: 'read' | 'up' | 'down', count: number, timestamp: number) {
  for (let i = 0; i < count; i++) {
    const id = `${signal}-${i}-${timestamp}`
    await state.client!.execute({ sql: 'INSERT INTO articles VALUES (?, ?, ?)', args: [id, `Article ${i}`, 'AI'] })
    await state.client!.execute({
      sql: 'INSERT INTO feedback (article_id, signal, device_id, created_at) VALUES (?, ?, ?, ?)',
      args: [id, signal, 'reader', timestamp / 1000],
    })
  }
}

it('neutral reads never enable preference learning or displace the latest votes', async () => {
  await add('up', 9, now - 86400_000)
  await add('read', 25, now)
  expect(await client.getRecentFeedback()).toEqual([])
  expect(await client.getRecentFeedback('reader')).toHaveLength(9)

  await add('down', 1, now - 3600_000)
  const preferences = await client.getRecentFeedback()
  expect(preferences).toHaveLength(10)
  expect(preferences.map((row) => row.signal)).toEqual(['down', ...Array(9).fill('up')])
  expect(await client.getRecentFeedback('other-device')).toEqual([])

  await add('up', 15, now - 7200_000)
  const recent = await client.getRecentFeedback()
  expect(recent).toHaveLength(20)
  expect(recent.every((row) => row.signal === 'up' || row.signal === 'down')).toBe(true)
})

it('neutral reading alone keeps the daily pipeline active', async () => {
  expect(await client.getLastActivityAt()).toBeNull()
  await add('read', 1, now)
  expect(await client.getLastActivityAt()).toEqual(new Date(now))
})

it('neutral reading suppresses the afternoon reminder for that device', async () => {
  await add('read', 1, now)
  await state.client!.execute({ sql: 'INSERT INTO push_subscriptions VALUES (?, ?)', args: ['reader', now / 1000] })
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  const { sendWebPush } = await import('../notify/web-push.js')
  await import('../reminder.js')
  await vi.waitFor(() => expect(log).toHaveBeenCalledWith(
    '[reminder] 2026-10-02 — 1 subscribed device(s), 1 active today, 0 already reminded, 0 to remind',
  ))
  expect(sendWebPush).not.toHaveBeenCalled()
})
