import { describe, expect, it } from 'vitest';
import { AgendaService } from '../../src/agenda/agendaService.js';
import { CalendarService } from '../../src/graph/calendarService.js';
import { OnlineMeetingService } from '../../src/graph/onlineMeetingService.js';
import { TranscriptService } from '../../src/transcripts/transcriptService.js';
import { AgendaItem } from '../../src/agenda/types.js';

const createCalendarService = (items: AgendaItem[]) =>
  ({
    listCalendarView: async () =>
      items.map((item, index) => ({
        id: item.eventId ?? String(index + 1),
        subject: item.subject,
        start: item.start ? { dateTime: item.start } : undefined,
        end: item.end ? { dateTime: item.end } : undefined,
        organizer: item.organizerEmail ? { emailAddress: { address: item.organizerEmail } } : undefined,
        onlineMeeting: item.joinUrl ? { joinUrl: item.joinUrl } : undefined
      }))
  }) as unknown as CalendarService;

const createOnlineMeetingService = (map: Record<string, string | undefined>) =>
  ({
    findOnlineMeetingIdByJoinUrl: async (joinUrl: string) => map[joinUrl]
  }) as unknown as OnlineMeetingService;

const createTranscriptService = (map: Record<string, string[]>) =>
  ({
    listTranscripts: async (meetingId: string) => map[meetingId]?.map((id) => ({ id })) ?? []
  }) as unknown as TranscriptService;

describe('AgendaService', () => {
  it('returns agenda items without transcript availability by default', async () => {
    const service = new AgendaService({
      calendarService: createCalendarService([{ eventId: '1', subject: 'Demo' }]),
      onlineMeetingService: createOnlineMeetingService({}),
      transcriptService: createTranscriptService({})
    });

    const result = await service.searchAgenda({
      startDateTime: '2024-01-01T00:00:00Z',
      endDateTime: '2024-01-02T00:00:00Z'
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].transcriptAvailable).toBeUndefined();
  });

  it('flags transcript availability when enabled', async () => {
    const service = new AgendaService({
      calendarService: createCalendarService([
        { eventId: '1', subject: 'Sync', joinUrl: 'https://join/1' },
        { eventId: '2', subject: 'No transcript', joinUrl: 'https://join/2' }
      ]),
      onlineMeetingService: createOnlineMeetingService({
        'https://join/1': 'm1',
        'https://join/2': 'm2'
      }),
      transcriptService: createTranscriptService({ m1: ['t1'] })
    });

    const result = await service.searchAgenda({
      startDateTime: '2024-01-01T00:00:00Z',
      endDateTime: '2024-01-02T00:00:00Z',
      includeTranscriptAvailability: true
    });

    expect(result.items[0].transcriptAvailable).toBe(true);
    expect(result.items[1].transcriptAvailable).toBe(false);
  });
});
