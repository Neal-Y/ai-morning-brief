// Spaced review for missed quiz questions.
//
// A question you got wrong comes back after 1 day; each correct answer since
// the last miss pushes the next review out (3 days, then 7). After three
// correct reviews in a row it "graduates" and only returns through the normal
// recycle path. Getting it wrong again restarts the ladder at 1 day.
//
// State is derived entirely from `quiz_attempts` — no extra table, nothing to
// migrate, and it can't drift from the attempt log.

export const REVIEW_INTERVALS_DAYS = [1, 3, 7] as const
/** Reviews per daily set, so fresh questions still make up most of it. */
export const REVIEW_MAX_PER_SET = 2

export interface AttemptRow {
  quizId: number
  correct: boolean
  answeredAt: Date
}

const DAY_MS = 24 * 60 * 60 * 1000
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000

function taipeiDay(d: Date): number {
  return Math.floor((d.getTime() + TAIPEI_OFFSET_MS) / DAY_MS)
}

/**
 * Quiz ids due for review as of `now`, most overdue first. Days are counted
 * in Taipei calendar days, so "1 day" means "tomorrow's set", not 24h later.
 */
export function dueReviewIds(attempts: AttemptRow[], now: Date = new Date()): number[] {
  const byQuiz = new Map<number, AttemptRow[]>()
  for (const a of attempts) {
    const list = byQuiz.get(a.quizId)
    if (list) list.push(a)
    else byQuiz.set(a.quizId, [a])
  }

  const today = taipeiDay(now)
  const due: { quizId: number; dueDay: number }[] = []
  for (const [quizId, list] of byQuiz) {
    list.sort((x, y) => x.answeredAt.getTime() - y.answeredAt.getTime())
    let lastWrong = -1
    list.forEach((a, i) => { if (!a.correct) lastWrong = i })
    if (lastWrong === -1) continue // never missed — not a review item

    const correctSince = list.length - 1 - lastWrong
    const interval = REVIEW_INTERVALS_DAYS[correctSince]
    if (interval === undefined) continue // graduated

    const dueDay = taipeiDay(list[list.length - 1]!.answeredAt) + interval
    if (dueDay <= today) due.push({ quizId, dueDay })
  }

  due.sort((a, b) => a.dueDay - b.dueDay || a.quizId - b.quizId)
  return due.map(d => d.quizId)
}
