import { describe, expect, it } from 'vitest'
import { LlmJsonError, parseLlmJson, repairJson } from './json.js'

describe('parseLlmJson', () => {
  it('leaves valid JSON (and fenced JSON) untouched', () => {
    expect(parseLlmJson('{"a":"b \\"c\\""}', 'test')).toEqual({ value: { a: 'b "c"' }, repaired: false })
    expect(parseLlmJson('```json\n{"a":1}\n```', 'test')).toEqual({ value: { a: 1 }, repaired: false })
  })

  it('repairs an ASCII quote copied into a string value', () => {
    // The shape that broke the 2026-10-02 brief: a quoted article title.
    const raw = '{"items":[{"title":"AI "agents" are here","summary":"他說"先測試"再上線，然後 rollout"},{"title":"x"}]}'
    const { value, repaired } = parseLlmJson(raw, 'test')
    expect(repaired).toBe(true)
    expect(value).toEqual({ items: [
      { title: 'AI "agents" are here', summary: '他說"先測試"再上線，然後 rollout' },
      { title: 'x' },
    ] })
  })

  it('keeps a quote followed by a prose comma inside the string', () => {
    const { value } = parseLlmJson('{"a":"用 "cache", 再看 TTL","b":1}', 'test')
    expect(value).toEqual({ a: '用 "cache", 再看 TTL', b: 1 })
  })

  it('repairs raw newlines and trailing commas', () => {
    const { value, repaired } = parseLlmJson('{"a":"line1\nline2","b":[1,2,],}', 'test')
    expect(repaired).toBe(true)
    expect(value).toEqual({ a: 'line1\nline2', b: [1, 2] })
  })

  it('fails with the error position and keeps the full text for the log', () => {
    const raw = `{"a": ${'x'.repeat(300)}}`
    try {
      parseLlmJson(raw, 'Brief generator')
      throw new Error('expected a failure')
    } catch (err) {
      expect(err).toBeInstanceOf(LlmJsonError)
      expect((err as LlmJsonError).message).toMatch(/^Brief generator returned invalid JSON \(\d+ chars\)/)
      expect((err as LlmJsonError).raw).toBe(raw)
    }
  })

  it('repairJson is a no-op on valid JSON', () => {
    const valid = '{"a":["x, y", {"b": "c\\"d"}], "e": null}'
    expect(repairJson(valid)).toBe(valid)
  })
})
