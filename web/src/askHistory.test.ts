import { describe, expect, it } from 'vitest'
import { MAX_SAVED_MESSAGES, trimForStorage, type AskMessage } from './askHistory.ts'

const thread = (turns: number): AskMessage[] => Array.from({ length: turns * 2 }, (_, i) => ({
  role: i % 2 ? 'assistant' : 'user', content: `${i % 2 ? 'a' : 'q'}${Math.floor(i / 2)}`,
}))

describe('trimForStorage', () => {
  it('keeps short threads unchanged', () => {
    expect(trimForStorage(thread(3))).toEqual(thread(3))
  })

  it('keeps the newest turns within the server limit, starting on a question', () => {
    const kept = trimForStorage(thread(25)) // 50 messages; the server accepts 40
    expect(kept).toHaveLength(MAX_SAVED_MESSAGES)
    expect(kept[0]).toEqual({ role: 'user', content: 'q5' })
    expect(kept.at(-1)).toEqual({ role: 'assistant', content: 'a24' })
  })

  it('stays under the total size limit', () => {
    const big = thread(10).map((m) => ({ ...m, content: m.content + 'x'.repeat(3990) }))
    const kept = trimForStorage(big)
    expect(kept.reduce((n, m) => n + m.content.length, 0)).toBeLessThanOrEqual(60000)
    expect(kept[0]!.role).toBe('user')
    expect(kept.every((m) => m.content.length <= 4000)).toBe(true)
  })
})
