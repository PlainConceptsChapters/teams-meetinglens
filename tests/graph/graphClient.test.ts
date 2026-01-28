import { describe, expect, it } from 'vitest';
import { GraphClient } from '../../src/graph/graphClient.js';

const createJsonResponse = (payload: unknown, status = 200) => {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
};

describe('GraphClient', () => {
  it('adds auth headers and query params', async () => {
    let seenUrl = '';
    let seenAuth = '';

    const client = new GraphClient({
      tokenProvider: async () => 'token-abc',
      fetcher: async (input, init) => {
        seenUrl = String(input);
        seenAuth = String(init?.headers && (init.headers as Record<string, string>).Authorization);
        return createJsonResponse({ value: [] });
      }
    });

    await client.get('/me/calendarView', { startDateTime: '2024-01-01', endDateTime: '2024-01-02' });

    expect(seenUrl).toContain('calendarView');
    expect(seenUrl).toContain('startDateTime=2024-01-01');
    expect(seenAuth).toBe('Bearer token-abc');
  });
});
