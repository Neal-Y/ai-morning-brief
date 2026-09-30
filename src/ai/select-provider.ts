import type { Config } from '../config.js'
import { OpenAIProvider } from './openai.js'
import { AnthropicProvider } from './anthropic.js'
import type { AIProvider } from './provider.js'
import { getTaipeiDayOfYear } from '../date.js'

/**
 * The other provider, when its key is configured — used when the day's primary
 * fails wholesale (2026-10-01: the OpenAI account ran out of credits and every
 * classification 429'd). Null when there is nothing to fall back to.
 */
export function fallbackProvider(config: Config, primary: AIProvider): AIProvider | null {
  if (primary.name === 'GPT' && config.anthropicApiKey) return new AnthropicProvider(config.anthropicApiKey)
  if (primary.name === 'Claude' && config.openaiApiKey) return new OpenAIProvider(config.openaiApiKey)
  return null
}

export function selectProvider(config: Config): AIProvider {
  // Single-provider mode
  if (config.aiProvider === 'openai') return new OpenAIProvider(config.openaiApiKey!)
  if (config.aiProvider === 'anthropic') return new AnthropicProvider(config.anthropicApiKey!)

  // Alternation mode: even day-of-year → GPT (OpenAI), odd → Claude (Anthropic)
  const dayOfYear = getTaipeiDayOfYear()
  const useGPT = dayOfYear % 2 === 0
  console.log(`[provider] Alternation mode — day ${dayOfYear} → ${useGPT ? 'GPT' : 'Claude'}`)

  if (useGPT) {
    if (!config.openaiApiKey) throw new Error('AI_PROVIDER=alternate requires OPENAI_API_KEY')
    return new OpenAIProvider(config.openaiApiKey)
  } else {
    if (!config.anthropicApiKey) throw new Error('AI_PROVIDER=alternate requires ANTHROPIC_API_KEY')
    return new AnthropicProvider(config.anthropicApiKey)
  }
}
