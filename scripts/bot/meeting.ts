import { MeetingTranscriptService } from '../../src/agenda/meetingTranscriptService.js';
import type { AgendaItem } from '../../src/agenda/types.js';
import type { ChannelRequest } from '../../src/teams/types.js';
import type { NluResult } from '../../src/teams/nluService.js';
import { formatDateRange, parseAgendaRange, stripDateNoise } from './agenda.js';

const resolveDateRangeFromNlu = (nlu?: NluResult): { start: Date; end: Date } | undefined => {
  if (!nlu?.dateRange?.startDateTime || !nlu.dateRange.endDateTime) {
    return undefined;
  }
  const start = new Date(nlu.dateRange.startDateTime);
  const end = new Date(nlu.dateRange.endDateTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return undefined;
  }
  return { start, end };
};

const parseTimeToMinutes = (value?: string): number | undefined => {
  if (!value) {
    return undefined;
  }
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return undefined;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (Number.isNaN(hour) || Number.isNaN(minute) || hour > 23 || minute > 59) {
    return undefined;
  }
  return hour * 60 + minute;
};

const findClosestMeetingByTime = (items: AgendaItem[], targetMinutes?: number) => {
  if (targetMinutes === undefined) {
    return items[0];
  }
  const scored = items
    .map((item) => {
      const start = item.start ? new Date(item.start) : undefined;
      if (!start || Number.isNaN(start.getTime())) {
        return { item, diff: Number.POSITIVE_INFINITY };
      }
      const minutes = start.getHours() * 60 + start.getMinutes();
      return { item, diff: Math.abs(minutes - targetMinutes) };
    })
    .filter((entry) => Number.isFinite(entry.diff));
  if (!scored.length) {
    return undefined;
  }
  scored.sort((a, b) => a.diff - b.diff);
  return scored[0].item;
};

export const findMeetingFromNlu = async (params: {
  request: ChannelRequest;
  englishText: string;
  nlu: NluResult | undefined;
  requireTranscript: boolean;
  buildGraphServicesForRequest: (request: ChannelRequest) => { agendaService: { searchAgenda: Function } };
}): Promise<AgendaItem | undefined> => {
  const { request, englishText, nlu, requireTranscript, buildGraphServicesForRequest } = params;
  const fallbackRange = parseAgendaRange(englishText);
  const nluRange = resolveDateRangeFromNlu(nlu);
  const range = nluRange ?? { start: fallbackRange.start, end: fallbackRange.end };
  const explicitSubject = /\b(about|subject|titled|called|with|regarding|keyword)\b/i.test(englishText);
  const subjectCandidate = stripDateNoise(nlu?.subject ?? fallbackRange.remainder);
  const subjectQuery = explicitSubject && subjectCandidate.length >= 3 ? subjectCandidate : '';
  const { agendaService } = buildGraphServicesForRequest(request);
  const agenda = await agendaService.searchAgenda({
    ...formatDateRange(range),
    subjectContains: subjectQuery || undefined,
    includeTranscriptAvailability: true,
    top: 10
  });
  let items = agenda.items as AgendaItem[];
  if (requireTranscript) {
    items = items.filter((item) => item.transcriptAvailable);
  }
  if (!items.length) {
    return undefined;
  }
  const targetMinutes = parseTimeToMinutes(nlu?.time);
  return findClosestMeetingByTime(items, targetMinutes);
};

export const getTranscriptFromMeetingContext = async (
  request: ChannelRequest,
  getMeetingTranscriptService: (request: ChannelRequest) => { onlineMeetingService: unknown; transcriptService: unknown }
) => {
  if (!request.meetingId && !request.meetingJoinUrl) {
    return undefined;
  }
  const { onlineMeetingService, transcriptService } = getMeetingTranscriptService(request);
  const transcriptLookup = new MeetingTranscriptService({
    onlineMeetingService: onlineMeetingService as any,
    transcriptService: transcriptService as any
  });
  return transcriptLookup.getTranscriptForMeetingContext({
    meetingId: request.meetingId,
    joinUrl: request.meetingJoinUrl
  });
};

export const findMostRecentMeetingWithTranscript = async (params: {
  request: ChannelRequest;
  buildGraphServicesForRequest: (request: ChannelRequest) => { agendaService: { searchAgenda: Function } };
  lookbackDays?: number;
}): Promise<AgendaItem | undefined> => {
  const { request, buildGraphServicesForRequest, lookbackDays = 14 } = params;
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - lookbackDays);
  const { agendaService } = buildGraphServicesForRequest(request);
  const agenda = await agendaService.searchAgenda({
    startDateTime: start.toISOString(),
    endDateTime: now.toISOString(),
    includeTranscriptAvailability: true,
    top: 50
  });
  const items = (agenda.items as AgendaItem[]).filter((item) => {
    const startTime = item.start ? new Date(item.start) : undefined;
    return item.transcriptAvailable && (!startTime || startTime <= now);
  });
  if (!items.length) {
    return undefined;
  }
  items.sort((a, b) => {
    const aTime = a.start ? new Date(a.start).getTime() : 0;
    const bTime = b.start ? new Date(b.start).getTime() : 0;
    return bTime - aTime;
  });
  return items[0];
};
