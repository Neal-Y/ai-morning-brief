import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider } from './provider.js';
import { MODEL_IDS } from '../config.js';

export class AnthropicProvider implements AIProvider {
  readonly name = 'Claude';
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async call(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model: MODEL_IDS['anthropic']!,
      max_tokens: 2048,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
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
