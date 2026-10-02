// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Quiz from './Quiz.tsx'
import { fetchQuizzes, submitQuizAttempt } from './api.ts'
import { writeQuizSession } from './quiz/session.ts'
import { getTaipeiDateString } from './date.ts'
import type { Quiz as QuizItem } from './quiz/types.ts'

declare const jsdom: { window: Window }

vi.mock('./api.ts', async (importOriginal) => ({
  ...await importOriginal<typeof import('./api.ts')>(),
  fetchActivity: vi.fn().mockResolvedValue({ streak: 3 }),
  fetchQuizzes: vi.fn(),
  submitQuizAttempt: vi.fn(),
}))

const quizzes: QuizItem[] = [1, 2, 3].map(id => ({
  id: String(id), category: 'CACHING', prompt: `題目 ${id}`, explanation: `解析 ${id}`,
  source: null, review: false, type: 'single_choice',
  options: ['重試', 'Jitter', '擴容', '清快取'], correctIndex: 1,
}))
let root: Root
let container: HTMLDivElement

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('localStorage', jsdom.window.localStorage)
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network request') }))
  localStorage.clear()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
  vi.unstubAllGlobals()
})

function button(label: string) {
  const found = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.trim() === label)
  if (!found) throw new Error(`Missing button: ${label}`)
  return found
}

describe('completed quiz review', () => {
  it('reviews only misses without recording another attempt, adding XP, or advancing the session', async () => {
    writeQuizSession({ date: getTaipeiDateString(), quizzes, index: 3, results: [false, true, null] })
    await act(async () => { root.render(<Quiz />) })
    const session = localStorage.getItem('mb_quiz_session')
    const completedText = container.textContent
    expect(completedText).toContain('1/2')
    expect(completedText).toContain('25')

    await act(async () => { button('回顧這次答錯的 1 題').click() })
    expect(container.textContent).toContain('題目 1')
    expect(container.textContent).toContain('B. Jitter')
    expect(container.textContent).toContain('解析 1')
    expect(container.textContent).not.toContain('題目 2')
    expect(container.textContent).not.toContain('題目 3')
    await act(async () => { button('← 返回完成頁').click() })

    expect(container.textContent).toBe(completedText)
    expect(localStorage.getItem('mb_quiz_session')).toBe(session)
    expect(submitQuizAttempt).not.toHaveBeenCalled()
    expect(fetchQuizzes).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not offer wrong-answer review when all answered questions are correct', async () => {
    writeQuizSession({ date: getTaipeiDateString(), quizzes, index: 3, results: [true, null, true] })
    await act(async () => { root.render(<Quiz />) })
    expect(container.textContent).toContain('2/2')
    expect(container.textContent).not.toContain('回顧這次答錯')
    expect(button('再來一輪')).toBeDefined()
    expect(submitQuizAttempt).not.toHaveBeenCalled()
  })
})
