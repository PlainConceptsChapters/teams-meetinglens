import { describe, expect, it } from 'vitest';
import { QaService } from '../../src/llm/qnaService.js';
import type { LlmClient } from '../../src/llm/types.js';

const client: LlmClient = {
  complete: async () => JSON.stringify({ answer: "I don't know", citations: [] })
};

describe('QaService fallback', () => {
  it('uses fallback cues when none match', async () => {
    const service = new QaService({ client, maxCues: 2 });
    const result = await service.answerQuestion('unrelated question', {
      raw: '',
      cues: [
        { start: '00:00:01', end: '00:00:10', text: 'Budget is approved', speaker: 'A' },
        { start: '00:00:11', end: '00:00:20', text: 'Timeline moved', speaker: 'B' }
      ]
    });
    expect(result.answer).toBe("I don't know");
  });
});
