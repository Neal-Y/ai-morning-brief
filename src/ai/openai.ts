import OpenAI from 'openai';
import type { AIProvider } from './provider.js';
import { MODEL_IDS } from '../config.js';

interface OpenAIUsageTotals {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
}

export class OpenAIProvider implements AIProvider {
  readonly name = 'GPT';
  private readonly client: OpenAI;
  private readonly usage: OpenAIUsageTotals = {
    calls: 0,
    promptTokens: 0,
    completionTokens: 0,
    cachedTokens: 0,
  };

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async call(system: string | string[], userPrompt: string): Promise<string> {
    // OpenAI auto-caches prefixes — no explicit cache_control API. Concatenate
    // array form back into a single string; the stable prefix still benefits
    // from automatic prefix caching as long as callers keep it first.
    const systemContent = typeof system === 'string' ? system : system.join('\n');

    const response = await this.client.chat.completions.create({
      model: MODEL_IDS['openai']!,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userPrompt },
      ],
    });

    const u = response.usage;
    const prompt = u?.prompt_tokens ?? 0;
    const completion = u?.completion_tokens ?? 0;
    // prompt_tokens_details.cached_tokens is on newer chat completion responses;
    // fall back to 0 if absent (older models / SDK versions).
    const cached = u?.prompt_tokens_details?.cached_tokens ?? 0;
    this.usage.calls += 1;
    this.usage.promptTokens += prompt;
    this.usage.completionTokens += completion;
    this.usage.cachedTokens += cached;
    console.log(
      `[ai:gpt] call ${this.usage.calls}: prompt=${prompt} completion=${completion} cached=${cached}`,
    );

    const text = response.choices[0]?.message.content;
    if (!text) throw new Error('OpenAI returned empty response');
    return text;
  }

  logUsageSummary(): void {
    const u = this.usage;
    if (u.calls === 0) {
      console.log('[ai:gpt] usage summary: 0 calls');
      return;
    }
    const cacheHitPct = u.promptTokens > 0
      ? Math.round((u.cachedTokens / u.promptTokens) * 100)
      : 0;
    console.log(
      `[ai:gpt] usage summary: ${u.calls} calls, prompt=${u.promptTokens} completion=${u.completionTokens} cached=${u.cachedTokens} (prefix cache hit ${cacheHitPct}%)`,
    );
  }
}
