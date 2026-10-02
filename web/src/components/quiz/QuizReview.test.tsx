// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuizReview } from './QuizReview.tsx'
import type { Quiz } from '../../quiz/types.ts'
import { WeeklyReview } from '../activity/WeeklyReview.tsx'
import type { WeeklyData } from '../../api.ts'

const base = { id: '1', category: 'CACHING', prompt: '如何處理這個情境？', explanation: '限制併發，避免資料庫負載繼續增加。', source: null, review: false }
const cases: { quiz: Quiz; answer: string }[] = [
  {
    quiz: { ...base, type: 'single_choice', options: ['加重試', '限制併發', '清空快取', '關閉監控'], correctIndex: 1 },
    answer: 'B. 限制併發',
  },
  { quiz: { ...base, type: 'ordering', items: ['確認影響', '限制流量', '修正根因'] }, answer: '1. 確認影響\n2. 限制流量\n3. 修正根因' },
  { quiz: { ...base, type: 'matching', left: ['同時過期', '慢查詢', '重試風暴'], right: ['Jitter', '索引', '退避'] }, answer: '同時過期 → Jitter\n慢查詢 → 索引\n重試風暴 → 退避' },
  { quiz: { ...base, type: 'fill_blank', template: '使用 {{0}}，避免 {{1}}。', blanks: ['退避', '重試風暴'], wordBank: ['退避', '重試風暴', '清空快取'] }, answer: '使用 「退避」，避免 「重試風暴」。' },
]

let root: Root
let container: HTMLDivElement

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Review must not make network requests') }))
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
  vi.unstubAllGlobals()
})

describe('read-only quiz answers', () => {
  it.each(cases)('shows the answer and explanation for $quiz.type', async ({ quiz, answer }) => {
    await act(async () => { root.render(<QuizReview quiz={quiz} />) })
    expect(container.textContent).toContain(quiz.prompt)
    expect(container.textContent).toContain(answer)
    expect(container.textContent).toContain(quiz.explanation)
    expect(container.querySelectorAll('button, input')).toHaveLength(0)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('opens weekly answers and handles older cached items without a payload', async () => {
    const data: WeeklyData = {
      weekLabel: '9/28 – 10/4', daysElapsed: 5, activeDays: 2, read: 3, answered: 4, correct: 2,
      lastWeek: { answered: 0, correct: 0 }, weakCategories: [], saved: [],
      missed: [
        { quizId: 1, category: 'CACHING', prompt: '已快取的舊題目' },
        {
          quizId: 2, category: 'CACHING', prompt: '同時失效的快取',
          question: {
            id: 2, type: 'single_choice', category: 'CACHING', prompt: '如何避免快取同時失效？',
            payload: { options: ['全部清除', 'TTL 加 Jitter', '更多重試', '重啟資料庫'], correctIndex: 1 },
            explanation: '分散到期時間。', sourceName: null, sourceUrl: null,
          },
        },
      ],
    }
    await act(async () => { root.render(<WeeklyReview data={data} />) })
    const rows = container.querySelectorAll('details')
    await act(async () => { rows[0]!.querySelector('summary')!.click() })
    expect(rows[0]!.open).toBe(true)
    expect(rows[0]!.textContent).toContain('這筆紀錄暫時沒有完整解析。')
    await act(async () => { rows[1]!.querySelector('summary')!.click() })
    expect(rows[1]!.open).toBe(true)
    expect(rows[1]!.textContent).toContain('B. TTL 加 Jitter')
    expect(rows[1]!.textContent).toContain('分散到期時間。')
    expect(fetch).not.toHaveBeenCalled()
  })
})
