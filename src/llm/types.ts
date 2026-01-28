export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmCompletionOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface LlmClient {
  complete(messages: LlmMessage[], options?: LlmCompletionOptions): Promise<string>;
}
