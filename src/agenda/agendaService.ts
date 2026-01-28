import { CalendarService } from '../graph/calendarService.js';
import { OnlineMeetingService } from '../graph/onlineMeetingService.js';
import { TranscriptService } from '../transcripts/transcriptService.js';
import { CalendarEvent } from '../types/meeting.js';
import { AgendaItem, AgendaSearchRequest, AgendaSearchResult } from './types.js';

export interface AgendaServiceOptions {
  calendarService: CalendarService;
  onlineMeetingService: OnlineMeetingService;
  transcriptService: TranscriptService;
  maxTranscriptChecks?: number;
}

const mapEventToItem = (event: CalendarEvent, userId?: string): AgendaItem => ({
  eventId: event.id,
  subject: event.subject,
  start: event.start?.dateTime,
  end: event.end?.dateTime,
  organizerEmail: event.organizer?.emailAddress?.address,
  joinUrl: event.onlineMeeting?.joinUrl,
  userId
});

const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> => {
  const results: R[] = [];
  let index = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current]);
    }
  });

  await Promise.all(runners);
  return results;
};

export class AgendaService {
  private readonly calendarService: CalendarService;
  private readonly onlineMeetingService: OnlineMeetingService;
  private readonly transcriptService: TranscriptService;
  private readonly maxTranscriptChecks: number;

  constructor(options: AgendaServiceOptions) {
    this.calendarService = options.calendarService;
    this.onlineMeetingService = options.onlineMeetingService;
    this.transcriptService = options.transcriptService;
    this.maxTranscriptChecks = options.maxTranscriptChecks ?? 10;
  }

  async searchAgenda(request: AgendaSearchRequest): Promise<AgendaSearchResult> {
    const events = await this.calendarService.listCalendarView({
      startDateTime: request.startDateTime,
      endDateTime: request.endDateTime,
      subjectContains: request.subjectContains,
      organizerEmail: request.organizerEmail,
      includeCancelled: request.includeCancelled,
      userId: request.userId
    });

    const items = events.map((event) => mapEventToItem(event, request.userId));
    const limitedItems = typeof request.top === 'number' ? items.slice(0, request.top) : items;

    if (!request.includeTranscriptAvailability) {
      return { items: limitedItems };
    }

    const limited = limitedItems.slice(0, this.maxTranscriptChecks);
    const checked = await mapWithConcurrency(limited, 4, async (item) => this.withTranscriptAvailability(item));
    const merged = [
      ...checked,
      ...limitedItems.slice(this.maxTranscriptChecks).map((item) => ({ ...item, transcriptAvailable: false }))
    ];

    return { items: merged };
  }

  private async withTranscriptAvailability(item: AgendaItem): Promise<AgendaItem> {
    if (!item.joinUrl && !item.onlineMeetingId) {
      return { ...item, transcriptAvailable: false };
    }

    try {
      let meetingId = item.onlineMeetingId;
      if (!meetingId && item.joinUrl) {
        meetingId = await this.onlineMeetingService.findOnlineMeetingIdByJoinUrl(item.joinUrl, item.userId);
      }

      if (!meetingId) {
        return { ...item, transcriptAvailable: false };
      }

      const transcripts = await this.transcriptService.listTranscripts(meetingId, item.userId);
      return { ...item, onlineMeetingId: meetingId, transcriptAvailable: transcripts.length > 0 };
    } catch {
      return { ...item, transcriptAvailable: false };
    }
  }
}
