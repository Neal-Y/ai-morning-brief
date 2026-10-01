import 'dotenv/config'
import { loadConfig } from './config.js'
import { fallbackProvider, selectProvider } from './ai/select-provider.js'
import { generateQuizzes } from './quiz/generate.js'
import { getRecentQuizPrompts, getReportedQuizzes, getUnseenQuizCounts } from './db/client.js'
import { writeQuizzesToDB } from './db/quiz-writer.js'

const QUIZ_COUNT = 5

// Stock check (2026-10-01): only generate when someone is running low. Old
// questions never expire (/api/quiz serves unseen ones first, then recycles),
// so a backlog of unanswered questions makes new ones wasted LLM spend.
/** Skip generation while every active device still has at least this many unanswered questions. */
const MIN_UNSEEN = 10
/** A device counts as active if it answered anything within this many days. */
const ACTIVE_DAYS = 14

async function main(): Promise<void> {
  let config: ReturnType<typeof loadConfig>
  try {
    config = loadConfig()
  } catch (err) {
    console.error('[config] Failed to load:', err instanceof Error ? err.message : err)
    process.exit(1)
  }

  if (process.env['FORCE'] !== '1') {
    let stock: Awaited<ReturnType<typeof getUnseenQuizCounts>>
    try {
      stock = await getUnseenQuizCounts(ACTIVE_DAYS)
    } catch (err) {
      console.error('[quiz-pipeline] Stock check failed:', err instanceof Error ? err.message : err)
      process.exit(1)
    }
    if (stock.length === 0) {
      console.log(`[quiz-pipeline] No device answered anything in ${ACTIVE_DAYS} days — skipping (set force to run anyway)`)
      return
    }
    const lowest = Math.min(...stock.map((s) => s.unseen))
    console.log(`[quiz-pipeline] Unanswered per active device: ${stock.map((s) => `${s.deviceId.slice(0, 8)}…=${s.unseen}`).join(', ')}`)
    if (lowest >= MIN_UNSEEN) {
      console.log(`[quiz-pipeline] Every active device has ≥ ${MIN_UNSEEN} unanswered — skipping (set force to run anyway)`)
      return
    }
  }

  console.log(`[quiz-pipeline] Generating ${QUIZ_COUNT} quizzes`)

  let provider = selectProvider(config)
  console.log(`[quiz-pipeline] Provider: ${provider.name}`)

  let recentPrompts: string[] = []
  try {
    recentPrompts = await getRecentQuizPrompts()
    console.log(`[quiz-pipeline] Loaded ${recentPrompts.length} recent prompts for dedup steering`)
  } catch (err) {
    console.warn('[quiz-pipeline] Failed to load recent prompts, continuing without dedup context:', err instanceof Error ? err.message : err)
  }

  let reported: Awaited<ReturnType<typeof getReportedQuizzes>> = []
  try {
    reported = await getReportedQuizzes()
    console.log(`[quiz-pipeline] Loaded ${reported.length} reported question(s) to steer away from`)
  } catch (err) {
    console.warn('[quiz-pipeline] Failed to load reported questions, continuing without them:', err instanceof Error ? err.message : err)
  }

  let generated: Awaited<ReturnType<typeof generateQuizzes>>
  try {
    generated = await generateQuizzes(provider, recentPrompts, QUIZ_COUNT, reported)
  } catch (err) {
    console.error(`[quiz-pipeline] Generation failed on ${provider.name}:`, err instanceof Error ? err.message : err)
    const fallback = fallbackProvider(config, provider)
    if (!fallback) process.exit(1)
    console.warn(`[quiz-pipeline] Falling back to ${fallback.name}`)
    provider = fallback
    try {
      generated = await generateQuizzes(provider, recentPrompts, QUIZ_COUNT, reported)
    } catch (err2) {
      console.error(`[quiz-pipeline] Generation failed on ${provider.name} too:`, err2 instanceof Error ? err2.message : err2)
      process.exit(1)
    }
  }

  provider.logUsageSummary()

  console.log(`[quiz-pipeline] Generated ${generated.length} valid quizzes (${generated.map((q) => q.type).join(', ')})`)

  try {
    await writeQuizzesToDB(generated)
  } catch (err) {
    console.error('[quiz-pipeline] DB write failed:', err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[quiz-pipeline] Unhandled error:', err)
  process.exit(1)
})
