import { describe, expect, it } from 'vitest';
import { AzureOpenAiClient } from '../../src/llm/azureOpenAiClient.js';

const createFetcher = (handler: (input: RequestInfo, init?: RequestInit) => Promise<Response>) => {
  return ((input: RequestInfo, init?: RequestInit) => handler(input, init)) as typeof fetch;
};

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });

describe('AzureOpenAiClient', () => {
  it('calls chat completions and returns content', async () => {
    let seenUrl = '';
    let seenApiKey = '';
    const fetcher = createFetcher(async (input, init) => {
      seenUrl = String(input);
      seenApiKey = String((init?.headers as Record<string, string>)['api-key']);
      return jsonResponse({ choices: [{ message: { content: 'hello' } }] });
    });

    const client = new AzureOpenAiClient({
      endpoint: 'https://example.openai.azure.com',
      apiKey: 'key-123',
      deployment: 'deploy-1',
      apiVersion: '2024-02-15-preview',
      fetcher
    });

    const result = await client.complete([{ role: 'user', content: 'hi' }]);
    expect(result).toBe('hello');
    expect(seenUrl).toContain('/openai/deployments/deploy-1/chat/completions');
    expect(seenUrl).toContain('api-version=2024-02-15-preview');
    expect(seenApiKey).toBe('key-123');
  });

  it('throws on missing content', async () => {
    const fetcher = createFetcher(async () => jsonResponse({ choices: [] }));
    const client = new AzureOpenAiClient({
      endpoint: 'https://example.openai.azure.com',
      apiKey: 'key-123',
      deployment: 'deploy-1',
      apiVersion: '2024-02-15-preview',
      fetcher
    });

    await expect(client.complete([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'missing message content'
    );
  });
});
