import OpenAI from 'openai';
import type { AIProvider } from './provider.js';
import { MODEL_IDS } from '../config.js';

export class OpenAIProvider implements AIProvider {
  readonly name = 'GPT';
  private readonly client: OpenAI;

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
    const text = response.choices[0]?.message.content;
    if (!text) throw new Error('OpenAI returned empty response');
    return text;
  }
}
