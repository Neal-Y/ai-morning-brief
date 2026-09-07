import { fetchQuizzes, type RawQuizItem } from '../api.ts'

interface BaseQuiz {
  id: string
  category: string // mono uppercase pill, e.g. "INFRASTRUCTURE"
  prompt: string
  explanation: string
  source: { name: string; url: string } | null
}

export interface SingleChoiceQuiz extends BaseQuiz {
  type: 'single_choice'
  options: string[] // exactly 4
  correctIndex: number // 0..3
}

export interface OrderingQuiz extends BaseQuiz {
  type: 'ordering'
  items: string[] // already correct; the card shuffles for display
}

export interface MatchingQuiz extends BaseQuiz {
  type: 'matching'
  left: string[]
  right: string[] // right[i] matches left[i]; the card shuffles right for display
}

export interface FillBlankQuiz extends BaseQuiz {
  type: 'fill_blank'
  template: string // blanks marked {{0}}, {{1}}, ... in order
  blanks: string[] // correct word per blank, in template order
  wordBank: string[] // answers + distractors, shuffled
}

export type Quiz = SingleChoiceQuiz | OrderingQuiz | MatchingQuiz | FillBlankQuiz

// The payload column is free-form JSON per type, so validate before trusting it:
// one malformed row must not blank the whole quiz.

function isSingleChoicePayload(p: Record<string, unknown>): p is { options: string[]; correctIndex: number } {
  const options = p['options']
  return Array.isArray(options) && options.length === 4 &&
    options.every(o => typeof o === 'string') && typeof p['correctIndex'] === 'number'
}

function isOrderingPayload(p: Record<string, unknown>): p is { items: string[] } {
  const items = p['items']
  return Array.isArray(items) && items.length >= 3 && items.every(i => typeof i === 'string')
}

function isMatchingPayload(p: Record<string, unknown>): p is { left: string[]; right: string[] } {
  const left = p['left']
  const right = p['right']
  return Array.isArray(left) && Array.isArray(right) &&
    left.length >= 3 && left.length === right.length &&
    left.every(i => typeof i === 'string') && right.every(i => typeof i === 'string')
}

function isFillBlankPayload(p: Record<string, unknown>): p is { template: string; blanks: string[]; wordBank: string[] } {
  const template = p['template']
  const blanks = p['blanks']
  const wordBank = p['wordBank']
  return typeof template === 'string' &&
    Array.isArray(blanks) && blanks.length >= 1 && blanks.every(b => typeof b === 'string') &&
    Array.isArray(wordBank) && wordBank.every(w => typeof w === 'string') &&
    blanks.every(b => wordBank.includes(b as string))
}

function mapApiItem(item: RawQuizItem): Quiz | null {
  const base = {
    id: String(item.id),
    category: item.category,
    prompt: item.prompt,
    explanation: item.explanation,
    source: item.sourceName && item.sourceUrl
      ? { name: item.sourceName, url: item.sourceUrl }
      : null,
  }
  const p = item.payload
  if (item.type === 'single_choice' && isSingleChoicePayload(p)) {
    return { ...base, type: 'single_choice', options: p.options, correctIndex: p.correctIndex }
  }
  if (item.type === 'ordering' && isOrderingPayload(p)) {
    return { ...base, type: 'ordering', items: p.items }
  }
  if (item.type === 'matching' && isMatchingPayload(p)) {
    return { ...base, type: 'matching', left: p.left, right: p.right }
  }
  if (item.type === 'fill_blank' && isFillBlankPayload(p)) {
    return { ...base, type: 'fill_blank', template: p.template, blanks: p.blanks, wordBank: p.wordBank }
  }
  return null
}

/**
 * Loads today's questions. Unlike the Sift app there is no hardcoded fallback
 * set: showing three stale canned questions as if they were today's is worse
 * than saying the quiz could not be loaded.
 */
export async function loadQuizzes(count = 5): Promise<Quiz[]> {
  const raw = await fetchQuizzes(count)
  return raw.map(mapApiItem).filter((q): q is Quiz => q !== null)
}

/** Fisher-Yates; retries if the shuffle happens to equal the identity order. */
export function shuffleWithOrigin<T>(items: T[]): { value: T; originalIndex: number }[] {
  const withIndex = items.map((value, originalIndex) => ({ value, originalIndex }))
  for (let attempt = 0; attempt < 5; attempt++) {
    const arr = [...withIndex]
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
    }
    if (arr.some((it, pos) => it.originalIndex !== pos)) return arr
  }
  return withIndex
}
