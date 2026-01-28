import { describe, expect, it } from 'vitest';
import { QaService } from '../../src/llm/qnaService.js';
import { LlmClient } from '../../src/llm/types.js';

const createClient = (): LlmClient => ({
  complete: async () => JSON.stringify({ answer: 'Yes', citations: ['00:00:01'] })
});

describe('QaService', () => {
  it('answers a question using transcript cues', async () => {
    const service = new QaService({ client: createClient() });
    const result = await service.answerQuestion('What is up?', {
      raw: '',
      cues: [{ start: '00:00:01', end: '00:00:02', text: 'What is up', speaker: 'Alex' }]
    });
    expect(result.answer).toBe('Yes');
  });
});
