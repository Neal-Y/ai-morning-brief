import 'dotenv/config'
import { loadConfig } from './config.js'
import { selectProvider } from './ai/select-provider.js'
import { generateQuizzes } from './quiz/generate.js'
import { getRecentQuizPrompts } from './db/client.js'
import { writeQuizzesToDB } from './db/quiz-writer.js'

const QUIZ_COUNT = 5

async function main(): Promise<void> {
  let config: ReturnType<typeof loadConfig>
  try {
    config = loadConfig()
  } catch (err) {
    console.error('[config] Failed to load:', err instanceof Error ? err.message : err)
    process.exit(1)
  }

  console.log(`[quiz-pipeline] Generating ${QUIZ_COUNT} quizzes`)

  const provider = selectProvider(config)
  console.log(`[quiz-pipeline] Provider: ${provider.name}`)

  let recentPrompts: string[] = []
  try {
    recentPrompts = await getRecentQuizPrompts()
    console.log(`[quiz-pipeline] Loaded ${recentPrompts.length} recent prompts for dedup steering`)
  } catch (err) {
    console.warn('[quiz-pipeline] Failed to load recent prompts, continuing without dedup context:', err instanceof Error ? err.message : err)
  }

  let generated: Awaited<ReturnType<typeof generateQuizzes>>
  try {
    generated = await generateQuizzes(provider, recentPrompts, QUIZ_COUNT)
  } catch (err) {
    console.error('[quiz-pipeline] Generation failed:', err instanceof Error ? err.message : err)
    process.exit(1)
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
