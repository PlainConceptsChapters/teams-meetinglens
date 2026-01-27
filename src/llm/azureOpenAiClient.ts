import { OutputValidationError } from '../errors/index.js';
import { LlmClient, LlmCompletionOptions, LlmMessage } from './types.js';

export interface AzureOpenAiClientOptions {
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion: string;
  defaultOptions?: LlmCompletionOptions;
  fetcher?: typeof fetch;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string; code?: string };
}

const normalizeEndpoint = (endpoint: string): string => endpoint.replace(/\/$/, '');

export class AzureOpenAiClient implements LlmClient {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly deployment: string;
  private readonly apiVersion: string;
  private readonly defaultOptions: LlmCompletionOptions;
  private readonly fetcher: typeof fetch;

  constructor(options: AzureOpenAiClientOptions) {
    this.endpoint = normalizeEndpoint(options.endpoint);
    this.apiKey = options.apiKey;
    this.deployment = options.deployment;
    this.apiVersion = options.apiVersion;
    this.defaultOptions = options.defaultOptions ?? {};
    this.fetcher = options.fetcher ?? fetch;
  }

  async complete(messages: LlmMessage[], options?: LlmCompletionOptions): Promise<string> {
    const url = `${this.endpoint}/openai/deployments/${this.deployment}/chat/completions?api-version=${this.apiVersion}`;
    const payload = {
      messages,
      temperature: options?.temperature ?? this.defaultOptions.temperature,
      max_tokens: options?.maxTokens ?? this.defaultOptions.maxTokens
    };

    const response = await this.fetcher(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.apiKey
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Azure OpenAI request failed (${response.status}): ${text}`.trim());
    }

    let data: ChatCompletionResponse;
    try {
      data = JSON.parse(text) as ChatCompletionResponse;
    } catch {
      throw new OutputValidationError('Azure OpenAI response was not valid JSON.');
    }

    if (data.error?.message) {
      const code = data.error.code ? ` (${data.error.code})` : '';
      throw new Error(`Azure OpenAI error${code}: ${data.error.message}`);
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new OutputValidationError('Azure OpenAI response missing message content.');
    }

    return content;
  }
}
