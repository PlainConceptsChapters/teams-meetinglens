import { describe, expect, it, vi } from 'vitest';
import type { ChannelRequest } from '../../src/teams/types.js';

vi.mock('../../src/agenda/meetingTranscriptService.js', () => ({
  MeetingTranscriptService: class {
    getTranscriptForMeetingContext = vi.fn().mockResolvedValue({ raw: 'context', cues: [] });
  }
}));

const { findMeetingFromNlu, findMostRecentMeetingWithTranscript, getTranscriptFromMeetingContext } = await import(
  '../../scripts/bot/meeting.js'
);

const request: ChannelRequest = {
  channelId: 'msteams',
  conversationId: 'conv',
  messageId: 'msg',
  fromUserId: 'user',
  text: 'meetings'
};

describe('bot meeting helpers', () => {
  it('picks closest meeting by time when provided', async () => {
    const agendaService = {
      searchAgenda: vi.fn().mockResolvedValue({
        items: [
          { eventId: '1', start: new Date(2026, 0, 30, 9, 0).toISOString(), transcriptAvailable: true },
          { eventId: '2', start: new Date(2026, 0, 30, 10, 0).toISOString(), transcriptAvailable: true },
          { eventId: '3', start: new Date(2026, 0, 30, 12, 30).toISOString(), transcriptAvailable: true }
        ]
      })
    };
    const meeting = await findMeetingFromNlu({
      request,
      englishText: 'meeting at 10:00',
      nlu: { time: '10:00' } as unknown as import('../../src/teams/nluService.js').NluResult,
      requireTranscript: true,
      buildGraphServicesForRequest: () => ({ agendaService })
    });
    expect(meeting?.eventId).toBe('2');
  });

  it('returns most recent transcripted meeting', async () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const older = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const agendaService = {
      searchAgenda: vi.fn().mockResolvedValue({
        items: [
          { eventId: 'old', start: older, transcriptAvailable: true },
          { eventId: 'new', start: recent, transcriptAvailable: true }
        ]
      })
    };
    const meeting = await findMostRecentMeetingWithTranscript({
      request,
      buildGraphServicesForRequest: () => ({ agendaService })
    });
    expect(meeting?.eventId).toBe('new');
  });

  it('returns transcript from meeting context', async () => {
    const result = await getTranscriptFromMeetingContext(
      {
        ...request,
        meetingId: 'meeting-1'
      },
      () => ({ onlineMeetingService: {}, transcriptService: {} })
    );
    expect(result?.raw).toBe('context');
  });
});
