import { describe, expect, it, vi, beforeEach } from 'vitest';
import { selectionStore } from '../../scripts/bot/stores.js';
import type { ChannelRequest, ProgressUpdate } from '../../src/teams/types.js';
import type { AgendaItem } from '../../src/agenda/types.js';
import type { LlmClient } from '../../src/llm/types.js';

vi.mock('../../src/llm/summarizationService.js', () => ({
  SummarizationService: class {
    async summarize() {
      return {
        summary: 'summary',
        keyPoints: [],
        actionItems: [],
        decisions: [],
        topics: [],
        templateData: {
          meetingHeader: {
            meetingTitle: 'Title',
            companiesParties: 'Company',
            date: '2026-01-01',
            duration: '30m',
            linkReference: ''
          },
          actionItemsDetailed: [],
          meetingPurpose: 'Purpose',
          keyPointsDetailed: [],
          topicsDetailed: [],
          pathForward: {
            definitionOfSuccess: 'Success',
            agreedNextAttempt: 'Next',
            decisionPoint: 'Decision',
            checkpointDate: ''
          },
          nextSteps: {
            partyA: { name: 'A', steps: [] },
            partyB: { name: 'B', steps: [] }
          }
        }
      };
    }
  }
}));

vi.mock('../../src/llm/qnaService.js', () => ({
  QaService: class {
    async answerQuestion() {
      return { answer: 'answer' };
    }
  }
}));

vi.mock('../../src/agenda/meetingTranscriptService.js', () => ({
  MeetingTranscriptService: class {
    async getTranscriptForAgendaItem() {
      return { raw: 'transcript', cues: [] };
    }
  }
}));

const { createSummaryHandlers } = await import('../../scripts/bot/summaryHandlers.js');

type RequestWithProgress = ChannelRequest & { progress: { update: (update: ProgressUpdate) => Promise<void> } };

const buildHandlers = () =>
  createSummaryHandlers({
    graphAccessToken: 'token',
    buildSignInResponse: async () => ({ text: 'signin' }),
    buildLlmClient: () => ({}) as unknown as LlmClient,
    buildSummaryLlmClient: () => ({}) as unknown as LlmClient,
    buildTranscript: async () => ({ raw: 'fallback', cues: [] }),
    getMeetingTranscriptService: () => ({ onlineMeetingService: {}, transcriptService: {} }),
    buildGraphServicesForRequest: () => ({ agendaService: { searchAgenda: vi.fn() } }),
    translateOutgoing: async (text) => text,
    t: (key: string) => key,
    selectionTtlMs: 60 * 60 * 1000
  });

describe('bot summary handlers', () => {
  beforeEach(() => {
    selectionStore.clear();
  });

  it('builds summary response for selected meeting', async () => {
    const handlers = buildHandlers();
    const updateMock = vi.fn().mockResolvedValue(undefined);
    const request: RequestWithProgress = {
      channelId: 'msteams',
      conversationId: 'conv',
      messageId: 'msg',
      fromUserId: 'user',
      text: '/summary',
      graphToken: 'token',
      progress: { update: updateMock as unknown as (update: ProgressUpdate) => Promise<void> }
    };
    selectionStore.set('conv', {
      items: [
        { index: 1, title: 'Meeting', details: '', agendaItem: { eventId: '1' } as AgendaItem }
      ],
      selectedIndex: 1,
      selectedAt: Date.now()
    });

    const response = await handlers.handleSummaryCommand(request, 'en');
    expect(response.text).toContain('**1. Meeting Header**');
    expect(response.text).toContain('**Meeting title:** Title');
    expect(response.text).toContain('summary.followupHint');
    expect(updateMock).toHaveBeenCalled();
  });

  it('answers QA with follow-up hint', async () => {
    const handlers = buildHandlers();
    const updateMock = vi.fn().mockResolvedValue(undefined);
    const request: RequestWithProgress = {
      channelId: 'msteams',
      conversationId: 'conv',
      messageId: 'msg',
      fromUserId: 'user',
      text: '/qa question',
      graphToken: 'token',
      progress: { update: updateMock as unknown as (update: ProgressUpdate) => Promise<void> }
    };
    selectionStore.set('conv', {
      items: [
        { index: 1, title: 'Meeting', details: '', agendaItem: { eventId: '1' } as AgendaItem }
      ],
      selectedIndex: 1,
      selectedAt: Date.now()
    });

    const response = await handlers.handleQaCommand(request, 'en', 'question');
    expect(response.text).toContain('qa.followupHint');
    expect(updateMock).toHaveBeenCalled();
  });
});
