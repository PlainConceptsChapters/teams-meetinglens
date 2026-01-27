export interface CalendarEvent {
  id: string;
  subject?: string;
  start?: { dateTime: string; timeZone?: string };
  end?: { dateTime: string; timeZone?: string };
  organizer?: { emailAddress?: { name?: string; address?: string } };
  isCancelled?: boolean;
  onlineMeeting?: { joinUrl?: string };
}

export interface CalendarViewOptions {
  startDateTime: string;
  endDateTime: string;
  subjectContains?: string;
  organizerEmail?: string;
  includeCancelled?: boolean;
  top?: number;
}

export interface MeetingIdentity {
  calendarEventId: string;
  subject?: string;
  start?: string;
  end?: string;
  organizerEmail?: string;
  joinUrl?: string;
}

export interface MeetingResolveRequest {
  eventId?: string;
  joinUrl?: string;
  subject?: string;
  startDateTime?: string;
  endDateTime?: string;
  organizerEmail?: string;
}
