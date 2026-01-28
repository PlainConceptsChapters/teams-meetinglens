import { GraphClient } from './graphClient.js';
import { CalendarEvent, CalendarViewOptions } from '../types/meeting.js';
import { InvalidRequestError, NotFoundError } from '../errors/index.js';

interface CalendarViewResponse {
  value: CalendarEvent[];
  '@odata.nextLink'?: string;
}

export interface CalendarServiceOptions {
  graphClient: GraphClient;
  maxPages?: number;
}

export class CalendarService {
  private readonly graphClient: GraphClient;
  private readonly maxPages: number;

  constructor(options: CalendarServiceOptions) {
    this.graphClient = options.graphClient;
    this.maxPages = options.maxPages ?? 3;
  }

  async listCalendarView(options: CalendarViewOptions): Promise<CalendarEvent[]> {
    if (!options.startDateTime || !options.endDateTime) {
      throw new InvalidRequestError('Calendar view requires start and end times.');
    }

    const query = this.buildCalendarQuery(options);
    const results: CalendarEvent[] = [];
    let page = 0;
    let nextLink: string | undefined;

    const basePath = options.userId ? `/users/${options.userId}/calendarView` : '/me/calendarView';

    do {
      page += 1;
      const response = await this.graphClient.get<CalendarViewResponse>(
        nextLink ? nextLink : basePath,
        nextLink ? undefined : query,
        { Prefer: 'outlook.timezone="UTC"' }
      );
      results.push(...(response.value ?? []));
      nextLink = response['@odata.nextLink'];
    } while (nextLink && page < this.maxPages);

    return results;
  }

  async getEventById(eventId: string): Promise<CalendarEvent> {
    if (!eventId) {
      throw new InvalidRequestError('Event id is required.');
    }
    const event = await this.graphClient.get<CalendarEvent>(`/me/events/${eventId}`);
    if (!event?.id) {
      throw new NotFoundError('Meeting not found.');
    }
    return event;
  }

  private buildCalendarQuery(options: CalendarViewOptions): Record<string, string> {
    const filterParts: string[] = [];
    if (options.subjectContains) {
      filterParts.push(`contains(subject,'${options.subjectContains.replace(/'/g, "''")}')`);
    }
    if (options.organizerEmail) {
      filterParts.push(`organizer/emailAddress/address eq '${options.organizerEmail.replace(/'/g, "''")}'`);
    }
    if (!options.includeCancelled) {
      filterParts.push('isCancelled eq false');
    }

    const query: Record<string, string> = {
      startDateTime: options.startDateTime,
      endDateTime: options.endDateTime,
      $select: 'id,subject,start,end,organizer,onlineMeeting,isCancelled'
    };

    if (filterParts.length > 0) {
      query['$filter'] = filterParts.join(' and ');
    }
    if (options.top) {
      query['$top'] = String(options.top);
    }

    return query;
  }
}
