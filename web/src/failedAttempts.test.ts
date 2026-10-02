// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

declare const jsdom: { window: Window }

beforeEach(() => {
  vi.stubGlobal('localStorage', jsdom.window.localStorage)
  localStorage.clear()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetModules() })

it('records attempts that fail to send, without resending them', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    .mockResolvedValueOnce(new Response('{}', { status: 503 }))
    .mockRejectedValueOnce(new TypeError('Load failed'))
  vi.stubGlobal('fetch', fetchMock)
  const { submitQuizAttempt, readFailedAttempts } = await import('./api.ts')

  await submitQuizAttempt(1, true)
  await submitQuizAttempt(2, false)
  await submitQuizAttempt(3, true)

  expect(fetchMock).toHaveBeenCalledTimes(3)
  expect(readFailedAttempts().map(({ quizId, reason }) => ({ quizId, reason }))).toEqual([
    { quizId: 2, reason: 'HTTP 503' },
    { quizId: 3, reason: 'Load failed' },
  ])
})
