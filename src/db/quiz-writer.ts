import { db } from './client.js'
import { quizzes } from './schema.js'
import type { GeneratedQuiz } from '../quiz/generate.js'

export async function writeQuizzesToDB(generated: GeneratedQuiz[]): Promise<void> {
  if (generated.length === 0) {
    throw new Error('writeQuizzesToDB called with 0 quizzes')
  }

  const rows = generated.map((q) => ({
    type: q.type,
    category: q.category,
    prompt: q.prompt,
    payload: JSON.stringify(q.payload),
    explanation: q.explanation,
    sourceName: null,
    sourceUrl: null,
    createdAt: new Date(),
  }))

  await db.insert(quizzes).values(rows)

  console.log(`[quiz-writer] Inserted ${rows.length} quizzes`)
}
