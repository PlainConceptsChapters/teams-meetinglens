import { describe, expect, it } from 'vitest';
import { SummarizationService } from '../../src/llm/summarizationService.js';
import { LlmClient } from '../../src/llm/types.js';

const createClient = (): LlmClient => ({
  complete: async () =>
    JSON.stringify({
      summary: 'Summary text',
      keyPoints: ['a'],
      actionItems: [],
      decisions: [],
      topics: []
    })
});

describe('SummarizationService', () => {
  it('summarizes transcript content', async () => {
    const service = new SummarizationService({ client: createClient() });
    const result = await service.summarize({ raw: 'hello', cues: [] });
    expect(result.summary).toBe('Summary text');
  });
});
