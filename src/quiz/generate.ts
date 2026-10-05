import type { AIProvider } from '../ai/provider.js'
import { parseLlmJson } from '../ai/json.js'
import { withRetry } from '../ai/retry.js'
import { RETRY_DELAY_MS } from '../config.js'
import type { QuizType } from './types.js'

const VALID_TYPES = new Set<QuizType>(['single_choice', 'ordering', 'matching', 'fill_blank'])

export const QUIZ_SYSTEM = `You are a quiz writer for a daily quiz app for backend / infrastructure engineers.

Your job is to write quiz questions that test backend engineering "sense": the kind of
judgment a working backend/infra engineer should have. Cover topics like system design,
networking, databases, caching, distributed systems, concurrency, API design, scalability,
observability, security fundamentals. Draw on your own general engineering knowledge —
do NOT invent obscure or disputed trivia, and do NOT require citing a specific source.

## Test decisions in context, not isolated terminology

- Every question must start from a concrete engineering situation: an observed symptom
  or goal, relevant constraints, and a decision the engineer needs to make. Keep the
  setup short enough to read on a phone (usually 2-3 sentences).
- Ask what to do first, which design fits the constraints, or how to order diagnostic /
  recovery steps. Do not ask for a definition, acronym expansion, or protocol sequence
  from memory. Naming a technology alone must not solve the question.
- State the constraints that make one answer best (e.g. consistency needs, latency,
  failure mode, workload, or operational cost). If two approaches would be reasonable
  under the stated facts, tighten the scenario rather than pretending one is always right.
- Distractors should be plausible engineering actions with a tradeoff that makes them
  less suitable here, not unrelated terms or obviously absurd choices.
- Keep all four question types: ordering can prioritize incident response steps;
  matching can pair short failure symptoms with remedies within a stated scenario;
  fill_blank can complete a concrete mitigation plan. Do not fall back to glossary
  matching or sentence-completion definitions just to use those formats.
- Explanations must connect the answer to the scenario's evidence and constraints,
  explain why the most tempting alternative is weaker here, and name the key tradeoff.

## Question types — produce a FREE MIX of these four. Vary it across the batch.

1. "single_choice" — payload: { "options": string[4], "correctIndex": 0-3 }
2. "ordering" — payload: { "items": string[] } — list 3-5 items ALREADY IN CORRECT ORDER
   (e.g. steps of a process, in the right sequence). The client shuffles them for display
   and checks if the user can drag them back into this order — so the array order you give
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
const REPORT_REASON_EN: Record<string, string> = {
  wrong_answer: 'the marked answer was wrong or debatable',
  unclear: 'the question was ambiguous',
  too_easy: 'it was too easy / trivia rather than judgment',
  other: 'flagged as low quality',
}

export function buildRecentQuizContext(
  recentPrompts: string[],
  reported: { prompt: string; reason: string }[] = [],
): string {
  let out = ''
  if (recentPrompts.length > 0) {
    const list = recentPrompts.slice(0, MAX_RECENT_PROMPTS)
    out += `

## AVOID REPEATING — recently asked questions

${list.map((p) => `- ${p}`).join('\n')}`
  }
  if (reported.length > 0) {
    out += `

## AVOID THESE MISTAKES — questions users reported as flawed
Do not produce questions like these, and avoid the flaw noted for each.

${reported.map((r) => `- ${r.prompt} (${REPORT_REASON_EN[r.reason] ?? REPORT_REASON_EN['other']})`).join('\n')}`
  }
  return out
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

const nonEmptyStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string' && x.trim().length > 0)
const distinct = (xs: string[]): boolean => new Set(xs.map((x) => x.trim())).size === xs.length

/** Word-bank chips are used once each, so the bank must hold every blank's answer as often as it is needed. */
function bankCovers(blanks: string[], wordBank: string[]): boolean {
  const available = new Map<string, number>()
  for (const w of wordBank) available.set(w, (available.get(w) ?? 0) + 1)
  for (const b of blanks) {
    const left = available.get(b) ?? 0
    if (left === 0) return false
    available.set(b, left - 1)
  }
  return true
}

/**
 * Whether a question can actually be answered correctly in the app. Before
 * 2026-10-02 this accepted e.g. `correctIndex: 1.5`, duplicate options (two
 * "right" answers), and fill-blanks needing the same word twice from a bank
 * that held it once.
 */
export function isValidPayload(type: QuizType, payload: Record<string, unknown>): boolean {
  switch (type) {
    case 'single_choice': {
      const options = payload['options']
      const correctIndex = payload['correctIndex']
      return (
        nonEmptyStrings(options) &&
        options.length === 4 &&
        distinct(options) &&
        Number.isInteger(correctIndex) &&
        (correctIndex as number) >= 0 &&
        (correctIndex as number) <= 3
      )
    }
    case 'ordering': {
      const items = payload['items']
      // Capped at 5: the web ordering card drags within one screen (touch-action: none
      // on rows), so a longer list would push rows off-screen with no way to scroll.
      // Distinct items: two identical rows would make more than one order "correct".
      return nonEmptyStrings(items) && items.length >= 3 && items.length <= 5 && distinct(items)
    }
    case 'matching': {
      const left = payload['left']
      const right = payload['right']
      return (
        nonEmptyStrings(left) &&
        nonEmptyStrings(right) &&
        left.length >= 3 &&
        left.length === right.length &&
        distinct(left) &&
        distinct(right)
      )
    }
    case 'fill_blank': {
      const template = payload['template']
      const blanks = payload['blanks']
      const wordBank = payload['wordBank']
      if (typeof template !== 'string' || !nonEmptyStrings(blanks) || !nonEmptyStrings(wordBank)) return false
      if (blanks.length === 0) return false
      // Each blank's placeholder appears exactly once, and there are no others.
      const placeholders = [...template.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]))
      if (placeholders.length !== blanks.length) return false
      if (!blanks.every((_, i) => placeholders.filter((p) => p === i).length === 1)) return false
      return bankCovers(blanks, wordBank)
    }
  }
}

function parseQuizBatch(raw: string): GeneratedQuiz[] {
  const { value: parsed, repaired } = parseLlmJson(raw, 'Quiz generator')
  if (repaired) console.warn('[quiz-gen] Repaired malformed JSON from the generator')

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

// Scenario-style questions (2026-10-02) run ~600-800 output tokens each; at the
// old shared 2048 cap a batch of 5 was cut off mid-JSON (2026-10-05). Billing is
// per token actually generated, so a generous cap costs nothing extra.
export const QUIZ_MAX_OUTPUT_TOKENS = 8192

export async function generateQuizzes(
  provider: AIProvider,
  recentPrompts: string[],
  count: number,
  reported: { prompt: string; reason: string }[] = [],
): Promise<GeneratedQuiz[]> {
  const recentContext = buildRecentQuizContext(recentPrompts, reported)
  const systemParts = recentContext ? [QUIZ_SYSTEM, recentContext] : [QUIZ_SYSTEM]

  return withRetry(
    async () => {
      const raw = await provider.call(systemParts, buildUserPrompt(count), { maxTokens: QUIZ_MAX_OUTPUT_TOKENS })
      const quizzes = parseQuizBatch(raw)
      if (quizzes.length === 0) {
        throw new Error('Quiz generator produced 0 valid questions')
      }
      return quizzes
    },
    { retries: 1, delayMs: RETRY_DELAY_MS, label: 'quiz-generate' }
  )
}
