import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AgendaItem } from '../../src/agenda/types.js';
import type { ChannelRequest } from '../../src/teams/types.js';

let agendaItems: AgendaItem[] = [];
let shouldFailMe = false;

vi.mock('../../src/agenda/agendaService.js', () => ({
  AgendaService: class {
    async searchAgenda() {
      return { items: agendaItems };
    }
  }
}));

vi.mock('../../src/graph/graphClient.js', () => ({
  GraphClient: class {
    async get() {
      if (shouldFailMe) {
        throw new Error('boom');
      }
      return { ok: true };
    }
  }
}));

vi.mock('../../src/graph/calendarService.js', () => ({
  CalendarService: class {}
}));

vi.mock('../../src/graph/onlineMeetingService.js', () => ({
  OnlineMeetingService: class {}
}));

vi.mock('../../src/transcripts/transcriptService.js', () => ({
  TranscriptService: class {}
}));

vi.mock('../../scripts/bot/logging.js', () => ({
  logEvent: vi.fn()
}));

const { getGraphTokenForRequest, runGraphDebug } = await import('../../scripts/bot/graph.js');

const request: ChannelRequest = {
  channelId: 'msteams',
  conversationId: 'conv',
  messageId: 'msg',
  fromUserId: 'user',
  text: 'hi'
};

describe('bot graph helpers', () => {
  beforeEach(() => {
    agendaItems = [];
    shouldFailMe = false;
  });

  it('prefers graph access token when provided', async () => {
    const token = await getGraphTokenForRequest({ ...request, graphToken: 'user-token' }, 'override');
    expect(token).toBe('override');
  });

  it('falls back to user token', async () => {
    const token = await getGraphTokenForRequest({ ...request, graphToken: 'user-token' }, undefined);
    expect(token).toBe('user-token');
  });

  it('returns graph debug stats', async () => {
    agendaItems = [
      { eventId: '1', joinUrl: 'https://example.com', transcriptAvailable: true },
      { eventId: '2', joinUrl: '', transcriptAvailable: false }
    ];
    const result = await runGraphDebug(request, 'https://graph.example');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.count).toBe(2);
      expect(result.withJoinUrl).toBe(1);
      expect(result.withTranscript).toBe(1);
    }
  });

  it('reports errors when graph call fails', async () => {
    shouldFailMe = true;
    const result = await runGraphDebug(request, 'https://graph.example');
    expect(result.ok).toBe(false);
  });
});
