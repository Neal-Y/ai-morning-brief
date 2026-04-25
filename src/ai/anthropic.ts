import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider } from './provider.js';
import { MODEL_IDS } from '../config.js';

interface AnthropicUsageTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export class AnthropicProvider implements AIProvider {
  readonly name = 'Claude';
  private readonly client: Anthropic;
  private readonly usage: AnthropicUsageTotals = {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
  };

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async call(system: string | string[], userPrompt: string): Promise<string> {
    // string → single cached block (legacy behavior).
    // string[] → first element cached, rest appended without cache_control so
    // a variable suffix (e.g. daily feedback context) doesn't bust the prefix cache.
    const systemBlocks = typeof system === 'string'
      ? [{ type: 'text' as const, text: system, cache_control: { type: 'ephemeral' as const } }]
      : system
          .filter((s) => s.length > 0)
          .map((text, i) => (i === 0
            ? { type: 'text' as const, text, cache_control: { type: 'ephemeral' as const } }
            : { type: 'text' as const, text }));

    const response = await this.client.messages.create({
      model: MODEL_IDS['anthropic']!,
      max_tokens: 2048,
      system: systemBlocks,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    });

    const u = response.usage;
    const cacheCreate = u.cache_creation_input_tokens ?? 0;
    const cacheRead = u.cache_read_input_tokens ?? 0;
    this.usage.calls += 1;
    this.usage.inputTokens += u.input_tokens;
    this.usage.outputTokens += u.output_tokens;
    this.usage.cacheCreationTokens += cacheCreate;
    this.usage.cacheReadTokens += cacheRead;
    console.log(
      `[ai:claude] call ${this.usage.calls}: in=${u.input_tokens} out=${u.output_tokens} cache_create=${cacheCreate} cache_read=${cacheRead}`,
    );

    const textBlocks = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text);
    if (textBlocks.length === 0) throw new Error('Anthropic returned no text blocks');
    return textBlocks.join('');
  }

  logUsageSummary(): void {
    const u = this.usage;
    if (u.calls === 0) {
      console.log('[ai:claude] usage summary: 0 calls');
      return;
    }
    // Cache hit ratio = cache_read / (cache_read + non-cached input). Non-cached
    // input here is u.inputTokens (which excludes cached reads in Anthropic's
    // accounting) plus cache_creation (first-write cost).
    const totalPrefixTokens = u.cacheReadTokens + u.cacheCreationTokens
    const cacheHitPct = totalPrefixTokens > 0
      ? Math.round((u.cacheReadTokens / totalPrefixTokens) * 100)
      : 0;
    console.log(
      `[ai:claude] usage summary: ${u.calls} calls, input=${u.inputTokens} output=${u.outputTokens} cache_create=${u.cacheCreationTokens} cache_read=${u.cacheReadTokens} (prefix cache hit ${cacheHitPct}%)`,
    );
  }
}
