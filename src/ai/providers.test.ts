import { beforeEach, describe, expect, it, vi } from 'vitest'

const anthropicCreate = vi.fn()
const openaiCreate = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create: anthropicCreate } },
}))
vi.mock('openai', () => ({
  default: class { chat = { completions: { create: openaiCreate } } },
}))
vi.mock('../config.js', () => ({ MODEL_IDS: { anthropic: 'claude-test', openai: 'gpt-test' } }))

const { AnthropicProvider } = await import('./anthropic.js')
const { OpenAIProvider } = await import('./openai.js')
const { DEFAULT_MAX_OUTPUT_TOKENS, OutputTruncatedError } = await import('./provider.js')

const claudeUsage = { input_tokens: 10, output_tokens: 20 }
const gptUsage = { prompt_tokens: 10, completion_tokens: 20 }

beforeEach(() => {
  anthropicCreate.mockReset()
  openaiCreate.mockReset()
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('AnthropicProvider', () => {
  it('passes the per-call output cap, defaulting to the shared one', async () => {
    anthropicCreate.mockResolvedValue({ stop_reason: 'end_turn', usage: claudeUsage, content: [{ type: 'text', text: '{}' }] })
    const p = new AnthropicProvider('k')
    await p.call('sys', 'user')
    await p.call('sys', 'user', { maxTokens: 8192 })
    expect(anthropicCreate.mock.calls.map(([req]) => req.max_tokens)).toEqual([DEFAULT_MAX_OUTPUT_TOKENS, 8192])
  })

  it('reports truncation instead of returning half a JSON document', async () => {
    // 2026-10-05: the quiz batch stopped at exactly out=2048 and surfaced as
    // "Unterminated string in JSON", which pointed at quoting, not the cap.
    anthropicCreate.mockResolvedValue({ stop_reason: 'max_tokens', usage: claudeUsage, content: [{ type: 'text', text: '[{"prompt":"cut' }] })
    await expect(new AnthropicProvider('k').call('sys', 'user')).rejects.toBeInstanceOf(OutputTruncatedError)
  })
})

describe('OpenAIProvider', () => {
  it('passes the output cap and reports truncation', async () => {
    openaiCreate.mockResolvedValueOnce({ usage: gptUsage, choices: [{ finish_reason: 'stop', message: { content: '{}' } }] })
    openaiCreate.mockResolvedValueOnce({ usage: gptUsage, choices: [{ finish_reason: 'length', message: { content: '{"a":"cut' } }] })
    const p = new OpenAIProvider('k')
    await expect(p.call('sys', 'user', { maxTokens: 8192 })).resolves.toBe('{}')
    expect(openaiCreate.mock.calls[0]![0].max_completion_tokens).toBe(8192)
    await expect(p.call('sys', 'user')).rejects.toBeInstanceOf(OutputTruncatedError)
  })
})
