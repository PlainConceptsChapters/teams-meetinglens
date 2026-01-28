import { describe, expect, it } from 'vitest';
import { NluService } from '../../src/teams/nluService.js';
import { LlmMessage } from '../../src/llm/types.js';

const createClient = (response: string) => ({
  complete: async (_messages: LlmMessage[]) => response
});

describe('NluService', () => {
  it('normalizes intent and date ranges', async () => {
    const client = createClient(
      '{"intent":"agenda","dateRange":{"startDateTime":"2026-01-20T00:00:00Z","endDateTime":"2026-01-20T23:59:00Z"},"subject":"design","time":"16:00"}'
    );
    const service = new NluService({ client });
    const result = await service.parse('meetings last monday', new Date('2026-01-28T00:00:00Z'));
    expect(result.intent).toBe('agenda');
    expect(result.dateRange?.startDateTime).toBe('2026-01-20T00:00:00.000Z');
    expect(result.subject).toBe('design');
    expect(result.time).toBe('16:00');
  });

  it('returns unknown intent on invalid JSON', async () => {
    const client = createClient('not-json');
    const service = new NluService({ client });
    const result = await service.parse('hello', new Date('2026-01-28T00:00:00Z'));
    expect(result.intent).toBe('unknown');
  });
});
