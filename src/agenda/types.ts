export interface AgendaSearchRequest {
  startDateTime: string;
  endDateTime: string;
  subjectContains?: string;
  organizerEmail?: string;
  includeCancelled?: boolean;
  top?: number;
  includeTranscriptAvailability?: boolean;
  userId?: string;
}

export interface AgendaItem {
  eventId: string;
  subject?: string;
  start?: string;
  end?: string;
  organizerEmail?: string;
  joinUrl?: string;
  onlineMeetingId?: string;
  transcriptAvailable?: boolean;
  userId?: string;
}

export interface AgendaSearchResult {
  items: AgendaItem[];
}
