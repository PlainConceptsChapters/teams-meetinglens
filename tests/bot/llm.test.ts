import { describe, expect, it, vi } from 'vitest';
import type { ChannelRequest } from '../../src/teams/types.js';
import type { TranscriptContent } from '../../src/types/transcript.js';
import type { SummarizationService } from '../../src/llm/summarizationService.js';
import type { QaService } from '../../src/llm/qnaService.js';

vi.mock('../../scripts/bot/logging.js', () => ({
  logEvent: vi.fn()
}));

vi.mock('../../src/llm/chunker.js', () => ({
  chunkText: () => [
    { text: 'chunk-1' },
    { text: 'chunk-2' }
  ]
}));

const request: ChannelRequest = {
  channelId: 'msteams',
  conversationId: 'conv',
  messageId: 'msg',
  fromUserId: 'user',
  text: 'hi'
};

const transcript: TranscriptContent = { raw: 'hello', cues: [] };

const load = async () => {
  const logging = await import('../../scripts/bot/logging.js');
  const { summarizeWithLogging, answerWithLogging } = await import('../../scripts/bot/llm.js');
  return { logging, summarizeWithLogging, answerWithLogging };
};

describe('bot llm logging', () => {
  it('logs summary lifecycle', async () => {
    const { logging, summarizeWithLogging } = await load();
    const summarizer = {
      summarize: vi.fn().mockResolvedValue({
        summary: 'ok',
        keyPoints: [],
        actionItems: [],
        decisions: [],
        topics: [],
        templateData: undefined
      })
    } as unknown as SummarizationService;

    await summarizeWithLogging(request, transcript, summarizer, { language: 'en' }, 'corr');
    expect(logging.logEvent).toHaveBeenCalledWith(expect.anything(), 'summary_request', expect.any(Object));
    expect(logging.logEvent).toHaveBeenCalledWith(expect.anything(), 'summary_complete', expect.any(Object));
  });

  it('logs qa lifecycle', async () => {
    const { logging, answerWithLogging } = await load();
    const qa = {
      answerQuestion: vi.fn().mockResolvedValue({ answer: 'yes' })
    } as unknown as QaService;

    await answerWithLogging(request, 'question', transcript, qa, { language: 'en' }, 'corr');
    expect(logging.logEvent).toHaveBeenCalledWith(expect.anything(), 'qa_request', expect.any(Object));
    expect(logging.logEvent).toHaveBeenCalledWith(expect.anything(), 'qa_complete', expect.any(Object));
  });
});
