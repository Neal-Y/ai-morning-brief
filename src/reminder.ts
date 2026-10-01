import 'dotenv/config'
import { and, eq, gte, isNotNull, sql } from 'drizzle-orm'
import { db, isMissingTable } from './db/client.js'
import { feedback, pushSubscriptions, quizAttempts } from './db/schema.js'
import { sendWebPush } from './notify/web-push.js'
import { computeStreak, taipeiDateString } from './streak.js'

// Afternoon reminder (reminder_sync.yml, ~16:00 Taipei).
//
// The morning push announces the brief; this one only goes to devices that
// haven't shown up today — no feedback row and no quiz attempt since Taipei
// midnight — so anyone who already read or answered is never nagged. The copy
// leads with the streak they're about to lose, and a tap opens /quiz.
//
// Bounded work: one query for subscribed devices, one for today's active
// devices, then one small per-device query (≤ 400 days of distinct days) only
// for the devices that actually get a push.

const DRY_RUN = process.env['DRY_RUN'] === '1'
const DAY_MS = 86400_000
const STREAK_LOOKBACK_DAYS = 400

// Taipei midnight as a unix-seconds timestamp column value.
function taipeiMidnightUtc(nowMs = Date.now()): Date {
  return new Date(`${taipeiDateString(nowMs)}T00:00:00+08:00`)
}

async function activeDeviceIdsToday(): Promise<Set<string>> {
  const since = taipeiMidnightUtc()
  const [quizRows, readRows] = await Promise.all([
    db.selectDistinct({ deviceId: quizAttempts.deviceId }).from(quizAttempts)
      .where(and(isNotNull(quizAttempts.deviceId), gte(quizAttempts.answeredAt, since))),
    db.selectDistinct({ deviceId: feedback.deviceId }).from(feedback)
      .where(and(isNotNull(feedback.deviceId), gte(feedback.createdAt, since))),
  ])
  return new Set([...quizRows, ...readRows].map((r) => r.deviceId!).filter(Boolean))
}

// Once per device per Taipei day (2026-10-01). GitHub's schedule is late or
// skipped often enough that the reminder sometimes has to be fired by hand,
// and the delayed scheduled run must not push the same device again. The table
// is created lazily, like quiz_reports — no migration needed.
async function remindedToday(date: string): Promise<Set<string>> {
  try {
    const rows = await db.all<{ device_id: string }>(sql`SELECT device_id FROM reminder_log WHERE date = ${date}`)
    return new Set(rows.map((r) => r.device_id))
  } catch (err) {
    if (isMissingTable(err)) return new Set()
    throw err
  }
}

async function logReminder(deviceId: string, date: string): Promise<void> {
  await db.run(sql`CREATE TABLE IF NOT EXISTS reminder_log (device_id TEXT NOT NULL, date TEXT NOT NULL, PRIMARY KEY (device_id, date))`)
  await db.run(sql`INSERT OR IGNORE INTO reminder_log (device_id, date) VALUES (${deviceId}, ${date})`)
}

async function streakThroughYesterday(deviceId: string): Promise<number> {
  const since = new Date(Date.now() - STREAK_LOOKBACK_DAYS * DAY_MS)
  const day = (col: typeof quizAttempts.answeredAt | typeof feedback.createdAt) =>
    sql<string>`date(${col}, 'unixepoch', '+8 hours')`
  const [quizDays, readDays] = await Promise.all([
    db.selectDistinct({ day: day(quizAttempts.answeredAt) }).from(quizAttempts)
      .where(and(eq(quizAttempts.deviceId, deviceId), gte(quizAttempts.answeredAt, since))),
    db.selectDistinct({ day: day(feedback.createdAt) }).from(feedback)
      .where(and(eq(feedback.deviceId, deviceId), gte(feedback.createdAt, since))),
  ])
  const days = [...new Set([...quizDays, ...readDays].map((r) => r.day))].sort().reverse()
  return computeStreak(days)
}

function copyFor(streak: number): { title: string; body: string } {
  if (streak >= 2) {
    return {
      title: `連續 ${streak} 天，別讓今天斷掉`,
      body: '今天的判斷題還在等你，5 題大約 3 分鐘。讀一篇簡報也算數。',
    }
  }
  return {
    title: '今天的判斷題準備好了',
    body: '5 題大約 3 分鐘，順手把連續天數養起來。',
  }
}

async function main() {
  const subscribed = await db.selectDistinct({ deviceId: pushSubscriptions.deviceId })
    .from(pushSubscriptions)
    .where(isNotNull(pushSubscriptions.deviceId))
  const today = taipeiDateString()
  const active = await activeDeviceIdsToday()
  const already = await remindedToday(today)
  const targets = subscribed.map((r) => r.deviceId!).filter((id) => id && !active.has(id) && !already.has(id))

  console.log(`[reminder] ${today} — ${subscribed.length} subscribed device(s), ${active.size} active today, ${already.size} already reminded, ${targets.length} to remind`)
  if (targets.length === 0) return

  let sent = 0
  const failures: string[] = []
  for (const deviceId of targets) {
    const streak = await streakThroughYesterday(deviceId)
    const { title, body } = copyFor(streak)
    const tag = deviceId.slice(0, 8)
    if (DRY_RUN) {
      console.log(`[reminder] (dry run) ${tag}… streak=${streak} → "${title}" / "${body}"`)
      continue
    }
    try {
      await sendWebPush(title, body, deviceId, '/quiz')
      sent++
      try {
        await logReminder(deviceId, today)
      } catch (err) {
        // The push already went out; a missing log row only risks a duplicate later today.
        console.warn(`[reminder] ${tag}… sent but not logged:`, err instanceof Error ? err.message : err)
      }
    } catch (err) {
      failures.push(`${tag}…: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (DRY_RUN) return
  console.log(`[reminder] sent to ${sent}/${targets.length} device(s)`)
  // Same rule as the morning pipeline: if every push failed, fail the Action so
  // it shows up red instead of silently doing nothing.
  if (sent === 0) {
    throw new Error(`All reminder pushes failed:\n${failures.join('\n')}`)
  }
  if (failures.length > 0) console.warn(`[reminder] partial failures:\n${failures.join('\n')}`)
}

main().catch((err) => {
  console.error('[reminder] fatal:', err)
  process.exit(1)
})
