import { CalendarService } from './calendarService.js';
import { CalendarEvent, MeetingIdentity, MeetingResolveRequest } from '../types/meeting.js';
import { InvalidRequestError, NotFoundError } from '../errors/index.js';

export interface MeetingResolverOptions {
  calendarService: CalendarService;
}

export class MeetingResolver {
  private readonly calendarService: CalendarService;

  constructor(options: MeetingResolverOptions) {
    this.calendarService = options.calendarService;
  }

  async resolveMeeting(request: MeetingResolveRequest): Promise<MeetingIdentity> {
    if (request.eventId) {
      const event = await this.calendarService.getEventById(request.eventId);
      return this.mapIdentity(event);
    }

    if (!request.startDateTime || !request.endDateTime) {
      throw new InvalidRequestError('Meeting resolution requires a time window when event id is absent.');
    }

    const events = await this.calendarService.listCalendarView({
      startDateTime: request.startDateTime,
      endDateTime: request.endDateTime,
      subjectContains: request.subject,
      organizerEmail: request.organizerEmail,
      includeCancelled: false,
      top: 50
    });

    const match = this.findBestMatch(events, request);
    if (!match) {
      throw new NotFoundError('Meeting not found.');
    }

    return this.mapIdentity(match);
  }

  private findBestMatch(events: CalendarEvent[], request: MeetingResolveRequest): CalendarEvent | undefined {
    if (request.joinUrl) {
      const byJoinUrl = events.find((event) => event.onlineMeeting?.joinUrl === request.joinUrl);
      if (byJoinUrl) {
        return byJoinUrl;
      }
    }

    if (request.subject) {
      const bySubject = events.find((event) => event.subject?.toLowerCase().includes(request.subject!.toLowerCase()));
      if (bySubject) {
        return bySubject;
      }
    }

    return events[0];
  }

  private mapIdentity(event: CalendarEvent): MeetingIdentity {
    return {
      calendarEventId: event.id,
      subject: event.subject,
      start: event.start?.dateTime,
      end: event.end?.dateTime,
      organizerEmail: event.organizer?.emailAddress?.address,
      joinUrl: event.onlineMeeting?.joinUrl
    };
  }
}
