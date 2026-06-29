// Real quizzes come from the pipeline (src/quiz-pipeline.ts) via GET /api/quiz.
// The hardcoded FALLBACK below is kept as an offline/error fallback only —
// not the primary path anymore.

import { fetchQuizzes, type RawQuizItem } from './api'

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
  items: string[] // already in correct order; the card shuffles for display
}

export interface MatchingQuiz extends BaseQuiz {
  type: 'matching'
  left: string[]
  right: string[] // right[i] is the correct match for left[i]; the card shuffles right for display
}

export interface FillBlankQuiz extends BaseQuiz {
  type: 'fill_blank'
  template: string // blanks marked as {{0}}, {{1}}, ... in order
  blanks: string[] // correct word per blank, in template order
  wordBank: string[] // blanks' answers + distractors, shuffled
}

export type Quiz = SingleChoiceQuiz | OrderingQuiz | MatchingQuiz | FillBlankQuiz

function isSingleChoicePayload(
  payload: Record<string, unknown>
): payload is { options: string[]; correctIndex: number } {
  const options = payload['options']
  const correctIndex = payload['correctIndex']
  return (
    Array.isArray(options) &&
    options.length === 4 &&
    options.every((o) => typeof o === 'string') &&
    typeof correctIndex === 'number'
  )
}

function isOrderingPayload(payload: Record<string, unknown>): payload is { items: string[] } {
  const items = payload['items']
  return Array.isArray(items) && items.length >= 3 && items.every((i) => typeof i === 'string')
}

function isMatchingPayload(
  payload: Record<string, unknown>
): payload is { left: string[]; right: string[] } {
  const left = payload['left']
  const right = payload['right']
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length >= 3 &&
    left.length === right.length &&
    left.every((i) => typeof i === 'string') &&
    right.every((i) => typeof i === 'string')
  )
}

function isFillBlankPayload(
  payload: Record<string, unknown>
): payload is { template: string; blanks: string[]; wordBank: string[] } {
  const template = payload['template']
  const blanks = payload['blanks']
  const wordBank = payload['wordBank']
  return (
    typeof template === 'string' &&
    Array.isArray(blanks) &&
    blanks.length >= 1 &&
    blanks.every((b) => typeof b === 'string') &&
    Array.isArray(wordBank) &&
    wordBank.every((w) => typeof w === 'string') &&
    blanks.every((b) => wordBank.includes(b))
  )
}

function mapApiItem(item: RawQuizItem): Quiz | null {
  const base = {
    id: String(item.id),
    category: item.category,
    prompt: item.prompt,
    explanation: item.explanation,
    source: item.sourceName && item.sourceUrl ? { name: item.sourceName, url: item.sourceUrl } : null,
  }
  if (item.type === 'single_choice' && isSingleChoicePayload(item.payload)) {
    return { ...base, type: 'single_choice', options: item.payload.options, correctIndex: item.payload.correctIndex }
  }
  if (item.type === 'ordering' && isOrderingPayload(item.payload)) {
    return { ...base, type: 'ordering', items: item.payload.items }
  }
  if (item.type === 'matching' && isMatchingPayload(item.payload)) {
    return { ...base, type: 'matching', left: item.payload.left, right: item.payload.right }
  }
  if (item.type === 'fill_blank' && isFillBlankPayload(item.payload)) {
    return {
      ...base,
      type: 'fill_blank',
      template: item.payload.template,
      blanks: item.payload.blanks,
      wordBank: item.payload.wordBank,
    }
  }
  return null
}

/** Loads real quizzes from the API; falls back to the hardcoded set on any failure. */
export async function loadQuestions(count = 5): Promise<Quiz[]> {
  try {
    const raw = await fetchQuizzes(count)
    const mapped = raw.map(mapApiItem).filter((q): q is Quiz => q !== null)
    if (mapped.length === 0) throw new Error('No usable quizzes in API response')
    return mapped
  } catch (err) {
    console.warn('[data] loadQuestions falling back to hardcoded set:', err)
    return FALLBACK
  }
}

const FALLBACK: Quiz[] = [
  {
    id: 'q1',
    type: 'single_choice',
    category: 'API PLATFORM',
    prompt: '一個 GraphQL resolver 先抓 100 篇貼文，再逐篇去抓每篇的作者。這個常見的效能問題叫什麼？',
    options: ['快取雪崩（cache stampede）', 'N+1 查詢問題', '競態條件（race condition）', '複寫延遲（replication lag）'],
    correctIndex: 1,
    explanation:
      'N+1：一次查詢拿到清單（1），再對每個項目各發一次查詢（N）。解法是用 DataLoader 批次化，或一次 join 把關聯資料一起撈回來。',
    source: { name: 'GraphQL Docs', url: 'https://graphql.org/learn/best-practices/' },
  },
  {
    id: 'q2',
    type: 'single_choice',
    category: 'INFRASTRUCTURE',
    prompt: '在 client / server 架構中，load balancer 最主要的角色是什麼？',
    options: [
      '當成所有後端共用的主資料庫',
      '把進來的流量分散到一群伺服器，並用健康檢查剔除掛掉的節點',
      '在轉發前先把 HTML 回應算好',
      '對所有 request 做靜態加密',
    ],
    correctIndex: 1,
    explanation:
      'Load balancer 把流量分散到一池無狀態伺服器，靠健康檢查跳過故障節點，讓單台掛掉不影響整體。它不存資料、也不算內容。',
    source: { name: 'AWS Docs', url: 'https://aws.amazon.com/what-is/load-balancing/' },
  },
  {
    id: 'q3',
    type: 'single_choice',
    category: 'DATA',
    prompt: '下列哪種資料庫複寫策略，提供「最強」的耐久性保證？',
    options: [
      '非同步、單區、最終一致',
      '同步、多區、需多數節點 quorum 確認寫入',
      '記憶體寫入、定期快照到磁碟',
      '非同步、WAL 寫入磁碟後才確認',
    ],
    correctIndex: 1,
    explanation:
      '同步 + 多區 + quorum 寫入：要跨多個資料中心、多數副本都確認才算成功，即使整個區域故障也不會掉已提交的資料。代價是延遲較高。',
    source: { name: 'Designing Data-Intensive Apps', url: 'https://dataintensive.net/' },
  },
]
