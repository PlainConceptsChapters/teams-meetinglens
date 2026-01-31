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

const extractJsonObject = (input: string): string | undefined => {
  const text = input.trim();
  if (!text) {
    return undefined;
  }
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      if (depth === 0) {
        start = i;
      }
      depth += 1;
      continue;
    }
    if (char === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return undefined;
};

const parseJsonPayload = <T>(raw: string, fallback: T): T => {
  const direct = parseJson(raw, fallback);
  if (direct !== fallback) {
    return direct;
  }
  const extracted = extractJsonObject(raw);
  if (!extracted) {
    return fallback;
  }
  return parseJson(extracted, fallback);
};

const stripSourceText = (translated: string, source: string): string => {
  const trimmedSource = source.trim();
  if (trimmedSource.length < 5) {
    return translated.trim();
  }
  const escaped = trimmedSource.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'gi');
  const stripped = translated.replace(regex, '').trim();
  return stripped || translated.trim();
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
          'Detect the language of the user text. Respond with JSON only: {"language":"<iso-code>"} where language is a lower-case ISO 639-1 code when possible. Do not include any other text.'
      },
      { role: 'user', content: text }
    ]);
    const parsed = parseJsonPayload<{ language?: string }>(response, {});
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
          'Translate the user text to the target language. Respond with JSON only: {"translated":"<text>"} Do not include the original text or any extra commentary.'
      },
      {
        role: 'user',
        content: `Target language: ${targetLanguage}\nText:\n${text}`
      }
    ]);
    const parsed = parseJsonPayload<{ translated?: string }>(response, {});
    const output = parsed.translated?.trim() || text;
    return stripSourceText(output, text);
  }
}
