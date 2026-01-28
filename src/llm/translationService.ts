import { LlmClient } from './types.js';

export interface TranslationServiceOptions {
  client: LlmClient;
}

const parseJson = <T>(input: string, fallback: T): T => {
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
};

export class TranslationService {
  private readonly client: LlmClient;

  constructor(options: TranslationServiceOptions) {
    this.client = options.client;
  }

  async detectLanguage(text: string): Promise<string> {
    if (!text.trim()) {
      return 'en';
    }
    const response = await this.client.complete([
      {
        role: 'system',
        content:
          'Detect the language of the user text. Respond with JSON only: {"language":"<iso-code>"} where language is a lower-case ISO 639-1 code when possible.'
      },
      { role: 'user', content: text }
    ]);
    const parsed = parseJson<{ language?: string }>(response, {});
    return parsed.language?.trim().toLowerCase() || 'en';
  }

  async translate(text: string, targetLanguage: string): Promise<string> {
    if (!text.trim() || targetLanguage.toLowerCase() === 'en') {
      return text;
    }
    const response = await this.client.complete([
      {
        role: 'system',
        content:
          'Translate the user text to the target language. Respond with JSON only: {"translated":"<text>"}'
      },
      {
        role: 'user',
        content: `Target language: ${targetLanguage}\nText:\n${text}`
      }
    ]);
    const parsed = parseJson<{ translated?: string }>(response, {});
    return parsed.translated?.trim() || text;
  }
}
