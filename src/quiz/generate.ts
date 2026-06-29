import type { AIProvider } from '../ai/provider.js'
import { extractJson } from '../ai/provider.js'
import { withRetry } from '../ai/retry.js'
import { RETRY_DELAY_MS } from '../config.js'
import type { QuizType } from './types.js'

const VALID_TYPES = new Set<QuizType>(['single_choice', 'ordering', 'matching', 'fill_blank'])

export const QUIZ_SYSTEM = `You are a quiz writer for "曉得 Quiz" — a daily quiz app for backend / infrastructure engineers.

Your job is to write quiz questions that test backend engineering "sense": the kind of
judgment a working backend/infra engineer should have. Cover topics like system design,
networking, databases, caching, distributed systems, concurrency, API design, scalability,
observability, security fundamentals. Draw on your own general engineering knowledge —
do NOT invent obscure or disputed trivia, and do NOT require citing a specific source.

## Question types — produce a FREE MIX of these four. Vary it across the batch.

1. "single_choice" — payload: { "options": string[4], "correctIndex": 0-3 }
2. "ordering" — payload: { "items": string[] } — list 3-5 items ALREADY IN CORRECT ORDER
   (e.g. steps of a process, in the right sequence). The client shuffles them for display
   and checks if the user can tap them back into this order — so the array order you give
   IS the answer key. Do not include a separate answer field.
3. "matching" — payload: { "left": string[], "right": string[] } — 3-4 pairs. right[i]
   MUST be the correct match for left[i] (parallel arrays, matched by index). The client
   shuffles the right column for display — so the index alignment you give IS the answer key.
   IMPORTANT: this renders as two narrow side-by-side columns on a phone, so BOTH sides
   must be SHORT — a term/name on the left (1-4 words) matched to a short phrase on the
   right (ideally <= 8 Chinese characters, no full sentences). If a pairing can only be
   expressed as a long sentence, use single_choice instead.
4. "fill_blank" — payload: { "template": string, "blanks": string[], "wordBank": string[] }
   template is a sentence with blanks marked as PLACEHOLDER0, PLACEHOLDER1, ... in order
   (literally the text "{{0}}", "{{1}}", etc). blanks[i] is the correct word/phrase for
   placeholder i. wordBank must contain every value in blanks PLUS a few plausible
   distractor words (shuffled client-side).

## Output constraints

- Output in Traditional Chinese (question text, options, explanations). Keep English only
  for established technical terms where that's the natural way engineers say it (e.g. "cache", "API").
- "category" is a short English label, UPPERCASE, 1-3 words (e.g. "DISTRIBUTED SYSTEMS", "CACHING", "API DESIGN").
- "explanation" must be concrete — state the actual reasoning, not "this is correct because it's correct".
- Do not repeat or closely rephrase any question listed in the "AVOID REPEATING" section, if present.
- JSON only, no markdown fence. Return a JSON array, one object per question:

[
  {
    "type": "single_choice | ordering | matching | fill_blank",
    "category": "...",
    "prompt": "...",
    "payload": { ... shape depends on type, see above ... },
    "explanation": "..."
  }
]`

const MAX_RECENT_PROMPTS = 60

/**
 * Build a dedup-steering section listing recent question prompts, appended at
 * the END of the system prompt so the stable QUIZ_SYSTEM prefix stays cacheable
 * across days (same technique as classifier.ts's buildPreferenceContext).
 */
export function buildRecentQuizContext(recentPrompts: string[]): string {
  if (recentPrompts.length === 0) return ''
  const list = recentPrompts.slice(0, MAX_RECENT_PROMPTS)
  return `

## AVOID REPEATING — recently asked questions

${list.map((p) => `- ${p}`).join('\n')}`
}

function buildUserPrompt(count: number): string {
  return `Generate exactly ${count} new quiz questions following the rules above.`
}

export interface GeneratedQuiz {
  type: QuizType
  category: string
  prompt: string
  payload: Record<string, unknown>
  explanation: string
}

function isValidPayload(type: QuizType, payload: Record<string, unknown>): boolean {
  switch (type) {
    case 'single_choice': {
      const options = payload['options']
      const correctIndex = payload['correctIndex']
      return (
        Array.isArray(options) &&
        options.length === 4 &&
        options.every((o) => typeof o === 'string' && o.length > 0) &&
        typeof correctIndex === 'number' &&
        correctIndex >= 0 &&
        correctIndex <= 3
      )
    }
    case 'ordering': {
      const items = payload['items']
      return Array.isArray(items) && items.length >= 3 && items.every((i) => typeof i === 'string' && i.length > 0)
    }
    case 'matching': {
      const left = payload['left']
      const right = payload['right']
      return (
        Array.isArray(left) &&
        Array.isArray(right) &&
        left.length >= 3 &&
        left.length === right.length &&
        left.every((i) => typeof i === 'string' && i.length > 0) &&
        right.every((i) => typeof i === 'string' && i.length > 0)
      )
    }
    case 'fill_blank': {
      const template = payload['template']
      const blanks = payload['blanks']
      const wordBank = payload['wordBank']
      if (typeof template !== 'string' || !Array.isArray(blanks) || !Array.isArray(wordBank)) return false
      if (!blanks.every((b) => typeof b === 'string' && b.length > 0)) return false
      const placeholders = blanks.map((_, i) => `{{${i}}}`)
      if (!placeholders.every((p) => template.includes(p))) return false
      const bankSet = new Set(wordBank);
      return blanks.every((b) => bankSet.has(b))
    }
  }
}

function parseQuizBatch(raw: string): GeneratedQuiz[] {
  const cleaned = extractJson(raw)
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(`Quiz generator returned invalid JSON: ${cleaned.slice(0, 150)}`)
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Quiz generator did not return a JSON array')
  }

  const valid: GeneratedQuiz[] = []
  for (const item of parsed) {
    const obj = item as Record<string, unknown>
    const type = String(obj['type'] ?? '')
    const category = String(obj['category'] ?? '').slice(0, 40)
    const prompt = String(obj['prompt'] ?? '')
    const explanation = String(obj['explanation'] ?? '')
    const payload = obj['payload']

    if (!VALID_TYPES.has(type as QuizType)) {
      console.warn(`[quiz-gen] Dropping item with invalid type: ${type}`)
      continue
    }
    if (!prompt || !explanation || typeof payload !== 'object' || payload === null) {
      console.warn(`[quiz-gen] Dropping item with missing fields (type=${type})`)
      continue
    }
    if (!isValidPayload(type as QuizType, payload as Record<string, unknown>)) {
      console.warn(`[quiz-gen] Dropping item with malformed payload (type=${type})`)
      continue
    }

    valid.push({ type: type as QuizType, category, prompt, payload: payload as Record<string, unknown>, explanation })
  }

  return valid
}

export async function generateQuizzes(
  provider: AIProvider,
  recentPrompts: string[],
  count: number
): Promise<GeneratedQuiz[]> {
  const recentContext = buildRecentQuizContext(recentPrompts)
  const systemParts = recentContext ? [QUIZ_SYSTEM, recentContext] : [QUIZ_SYSTEM]

  return withRetry(
    async () => {
      const raw = await provider.call(systemParts, buildUserPrompt(count))
      const quizzes = parseQuizBatch(raw)
      if (quizzes.length === 0) {
        throw new Error('Quiz generator produced 0 valid questions')
      }
      return quizzes
    },
    { retries: 1, delayMs: RETRY_DELAY_MS, label: 'quiz-generate' }
  )
}
