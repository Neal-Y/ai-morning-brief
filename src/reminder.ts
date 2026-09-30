import 'dotenv/config'
import { and, eq, gte, isNotNull, sql } from 'drizzle-orm'
import { db } from './db/client.js'
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
  const active = await activeDeviceIdsToday()
  const targets = subscribed.map((r) => r.deviceId!).filter((id) => id && !active.has(id))

  console.log(`[reminder] ${taipeiDateString()} — ${subscribed.length} subscribed device(s), ${active.size} active today, ${targets.length} to remind`)
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
