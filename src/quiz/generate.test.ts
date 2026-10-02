import { describe, expect, it } from 'vitest'
import { isValidPayload } from './generate.js'

describe('isValidPayload — only questions that can be answered correctly', () => {
  const choice = (extra: Record<string, unknown>) => ({ options: ['a', 'b', 'c', 'd'], correctIndex: 1, ...extra })

  it('single_choice needs an integer index and four distinct options', () => {
    expect(isValidPayload('single_choice', choice({}))).toBe(true)
    expect(isValidPayload('single_choice', choice({ correctIndex: 1.5 }))).toBe(false)
    expect(isValidPayload('single_choice', choice({ correctIndex: 4 }))).toBe(false)
    expect(isValidPayload('single_choice', choice({ options: ['a', 'b', 'b', 'd'] }))).toBe(false)
  })

  it('ordering and matching reject duplicates', () => {
    expect(isValidPayload('ordering', { items: ['x', 'y', 'z'] })).toBe(true)
    expect(isValidPayload('ordering', { items: ['x', 'y', 'x'] })).toBe(false)
    expect(isValidPayload('matching', { left: ['a', 'b', 'c'], right: ['1', '2', '3'] })).toBe(true)
    expect(isValidPayload('matching', { left: ['a', 'b', 'c'], right: ['1', '1', '3'] })).toBe(false)
  })

  it('fill_blank needs the bank to hold each answer as often as it is used', () => {
    const base = { template: '先寫 {{0}}，再刪 {{1}}', blanks: ['DB', 'cache'], wordBank: ['cache', 'DB', 'queue'] }
    expect(isValidPayload('fill_blank', base)).toBe(true)
    // Both blanks need "cache" but the bank holds it once: unanswerable.
    expect(isValidPayload('fill_blank', { ...base, blanks: ['cache', 'cache'] })).toBe(false)
    expect(isValidPayload('fill_blank', { ...base, blanks: ['cache', 'cache'], wordBank: ['cache', 'cache', 'DB'] })).toBe(true)
    // Placeholders must match the blanks one-to-one.
    expect(isValidPayload('fill_blank', { ...base, template: '先寫 {{0}}，再刪 {{0}}' })).toBe(false)
    expect(isValidPayload('fill_blank', { ...base, template: '{{0}} {{1}} {{2}}' })).toBe(false)
  })
})
