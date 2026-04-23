import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider } from './provider.js';
import { MODEL_IDS } from '../config.js';

export class AnthropicProvider implements AIProvider {
  readonly name = 'Claude';
  private readonly client: Anthropic;

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
    const textBlocks = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text);
    if (textBlocks.length === 0) throw new Error('Anthropic returned no text blocks');
    return textBlocks.join('');
  }
}
