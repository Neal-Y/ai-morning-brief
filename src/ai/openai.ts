import OpenAI from 'openai';
import type { AIProvider } from './provider.js';
import { MODEL_IDS } from '../config.js';

export class OpenAIProvider implements AIProvider {
  readonly name = 'GPT';
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async call(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: MODEL_IDS['openai']!,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });
    const text = response.choices[0]?.message.content;
    if (!text) throw new Error('OpenAI returned empty response');
    return text;
  }
}
