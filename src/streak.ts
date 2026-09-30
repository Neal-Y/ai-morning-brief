// Streak = consecutive Taipei calendar days with any activity (a feedback row
// or a quiz attempt), ending today or yesterday. Shared by /api/activity and
// the afternoon reminder so both count the same way.

const DAY_MS = 86400_000

export function taipeiDateString(ms: number = Date.now()): string {
  return new Date(ms + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** `sortedDaysDesc`: distinct YYYY-MM-DD (Taipei) strings, newest first. */
export function computeStreak(sortedDaysDesc: string[], nowMs: number = Date.now()): number {
  if (sortedDaysDesc.length === 0) return 0
  const todayStr = taipeiDateString(nowMs)
  const yestStr = taipeiDateString(nowMs - DAY_MS)
  if (sortedDaysDesc[0] !== todayStr && sortedDaysDesc[0] !== yestStr) return 0
  let streak = 0
  let expected = sortedDaysDesc[0]!
  for (const day of sortedDaysDesc) {
    if (day !== expected) break
    streak++
    expected = new Date(new Date(expected + 'T00:00:00Z').getTime() - DAY_MS).toISOString().slice(0, 10)
  }
  return streak
}
