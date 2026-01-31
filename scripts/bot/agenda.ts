import type { AgendaItem } from '../../src/agenda/types.js';
import type { ChannelRequest, ChannelResponse } from '../../src/teams/types.js';
import type { LanguageCode } from '../../src/teams/language.js';
import type { NluResult } from '../../src/teams/nluService.js';
import { logEvent, isLogEnabled } from './logging.js';

export const formatDateRange = (range: { start: Date; end: Date }) => ({
  startDateTime: range.start.toISOString(),
  endDateTime: range.end.toISOString()
});

export const parseAgendaRange = (text: string): { start: Date; end: Date; remainder: string; isFutureQuery: boolean } => {
  const now = new Date();
  const tokens = text.toLowerCase();
  const explicit = parseExplicitDate(tokens);
  if (explicit) {
    return { ...explicit, isFutureQuery: explicit.start > now };
  }
  const relativeWeekday = parseRelativeWeekday(tokens, now);
  if (relativeWeekday) {
    return { ...relativeWeekday, isFutureQuery: relativeWeekday.start > now };
  }
  const relativeDays = parseRelativeDays(tokens, now);
  if (relativeDays) {
    return { ...relativeDays, isFutureQuery: false };
  }
  if (tokens.includes('yesterday') || tokens.includes('ayer') || tokens.includes('ieri')) {
    const start = new Date(now);
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end, remainder: text.replace(/yesterday|ayer|ieri/gi, '').trim(), isFutureQuery: false };
  }
  if (tokens.includes('today') || tokens.includes('hoy') || tokens.includes('azi')) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end, remainder: text.replace(/today|hoy|azi/gi, '').trim(), isFutureQuery: false };
  }
  if (tokens.includes('tomorrow') || tokens.includes('manana') || tokens.includes('maine')) {
    const start = new Date(now);
    start.setDate(start.getDate() + 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end, remainder: text.replace(/tomorrow|manana|maine/gi, '').trim(), isFutureQuery: true };
  }
  if (tokens.includes('week') || tokens.includes('semana') || tokens.includes('saptamana')) {
    const start = new Date(now);
    const end = new Date(now);
    end.setDate(end.getDate() + 7);
    return { start, end, remainder: text.replace(/week|semana|saptamana/gi, '').trim(), isFutureQuery: true };
  }
  const start = new Date(now);
  const end = new Date(now);
  end.setDate(end.getDate() + 7);
  return { start, end, remainder: text.trim(), isFutureQuery: true };
};

const parseRelativeDays = (text: string, base: Date): { start: Date; end: Date; remainder: string } | undefined => {
  const match = text.match(/\b(?:last|past)\s+(\d+)\s+days?\b/i);
  const plain = text.match(/\b(?:last|past)\s+days?\b/i);
  const count = match ? Number(match[1]) : plain ? 7 : undefined;
  if (!count || Number.isNaN(count)) {
    return undefined;
  }
  const end = new Date(base);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - count);
  start.setHours(0, 0, 0, 0);
  const remainder = match ? text.replace(match[0], '').trim() : text.replace(plain?.[0] ?? '', '').trim();
  return { start, end: new Date(end.getTime() + 1), remainder };
};

export const stripDateNoise = (value?: string): string => {
  if (!value) {
    return '';
  }
  return value
    .replace(
      /\b(today|tomorrow|yesterday|last|next|this|week|month|year|day|days|past|from)\b/gi,
      ''
    )
    .replace(
      /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/gi,
      ''
    )
    .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
    .replace(/\b(on|in|at|for|the|of)\b/gi, '')
    .replace(/[\d\/\-,?]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const parseRelativeWeekday = (text: string, base: Date): { start: Date; end: Date; remainder: string } | undefined => {
  const weekdays: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6
  };
  const match = text.match(/\b(?:(last|next|this)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
  if (!match) {
    return undefined;
  }
  const [, qualifier, weekday] = match;
  const target = weekdays[weekday.toLowerCase()];
  const today = new Date(base);
  const todayDow = today.getDay();
  let delta = 0;
  if (qualifier?.toLowerCase() === 'last') {
    delta = (todayDow - target + 7) % 7;
    if (delta === 0) {
      delta = 7;
    }
    today.setDate(today.getDate() - delta);
  } else if (qualifier?.toLowerCase() === 'next') {
    delta = (target - todayDow + 7) % 7;
    if (delta === 0) {
      delta = 7;
    }
    today.setDate(today.getDate() + delta);
  } else {
    delta = (target - todayDow + 7) % 7;
    today.setDate(today.getDate() + delta);
  }

  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(end.getDate() + 1);
  return { start: today, end, remainder: text.replace(match[0], '').trim() };
};

const parseExplicitDate = (text: string): { start: Date; end: Date; remainder: string } | undefined => {
  const monthNames: Record<string, number> = {
    jan: 0,
    january: 0,
    feb: 1,
    february: 1,
    mar: 2,
    march: 2,
    apr: 3,
    april: 3,
    may: 4,
    jun: 5,
    june: 5,
    jul: 6,
    july: 6,
    aug: 7,
    august: 7,
    sep: 8,
    sept: 8,
    september: 8,
    oct: 9,
    october: 9,
    nov: 10,
    november: 10,
    dec: 11,
    december: 11
  };

  const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);
    const date = new Date(year, month, day);
    if (!Number.isNaN(date.getTime())) {
      return buildExplicitRange(date, isoMatch[0], text);
    }
  }

  const namedMatch =
    text.match(/\b(\d{1,2})[\/\-\s]+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[\/\-\s]+(\d{4})\b/i) ||
    text.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(\d{4})\b/i);

  if (namedMatch) {
    const [full, part1, part2, part3] = namedMatch;
    const isMonthFirst = !!monthNames[part1.toLowerCase()];
    const day = Number(isMonthFirst ? part2 : part1);
    const monthName = (isMonthFirst ? part1 : part2).toLowerCase();
    const year = Number(part3);
    const month = monthNames[monthName];
    const date = new Date(year, month, day);
    if (!Number.isNaN(date.getTime())) {
      return buildExplicitRange(date, full, text);
    }
  }

  const numericMatch = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
  if (numericMatch) {
    const [full, part1, part2, part3] = numericMatch;
    const first = Number(part1);
    const second = Number(part2);
    const year = Number(part3);
    const isDayFirst = first > 12;
    const day = isDayFirst ? first : second;
    const month = (isDayFirst ? second : first) - 1;
    const date = new Date(year, month, day);
    if (!Number.isNaN(date.getTime())) {
      return buildExplicitRange(date, full, text);
    }
  }

  return undefined;
};

const buildExplicitRange = (date: Date, matched: string, text: string) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    start,
    end,
    remainder: text.replace(matched, '').trim()
  };
};

export const formatRangeLabel = (range: { start: Date; end: Date }) => {
  const startLabel = range.start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
  const endLabel = new Date(range.end.getTime() - 1).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
  if (startLabel === endLabel) {
    return startLabel;
  }
  return `${startLabel} - ${endLabel}`;
};

export const formatAgendaItem = (item: AgendaItem, t: (key: string, vars?: Record<string, string>) => string) => {
  const subject = item.subject ?? t('agenda.untitled');
  const start = item.start ? new Date(item.start).toLocaleString() : t('agenda.unknownTime');
  const end = item.end ? new Date(item.end).toLocaleString() : '';
  const transcript = item.transcriptAvailable ? t('agenda.transcriptAvailable') : t('agenda.noTranscript');
  const organizer = item.organizerEmail ? t('agenda.organizer', { organizer: item.organizerEmail }) : '';
  const details = [start, end && `- ${end}`, organizer, transcript]
    .filter(Boolean)
    .join(' ');
  return { title: subject, details };
};

export const handleAgendaRequest = async (params: {
  request: ChannelRequest;
  englishText: string;
  nlu?: NluResult;
  preferred: LanguageCode;
  t: (key: string, vars?: Record<string, string>) => string;
  translateOutgoing: (text: string, language: LanguageCode) => Promise<string>;
  buildAgendaCard: (title: string, items: { index: number; title: string; details: string }[]) => unknown;
  selectionStore: Map<string, { items: { index: number; title: string; details: string; agendaItem: AgendaItem }[] }>;
  buildGraphServicesForRequest: (request: ChannelRequest) => { agendaService: { searchAgenda: Function } };
  formatRangeLabel: (range: { start: Date; end: Date }) => string;
}) : Promise<ChannelResponse> => {
  const { request, englishText, nlu, preferred, t, translateOutgoing, buildAgendaCard, selectionStore, buildGraphServicesForRequest } = params;
  const fallbackRange = parseAgendaRange(englishText);
  const nluRange = resolveDateRangeFromNlu(nlu);
  const range = nluRange ?? { start: fallbackRange.start, end: fallbackRange.end };
  const now = new Date();
  if (fallbackRange.isFutureQuery && range.start > now) {
    return { text: await translateOutgoing(t('agenda.futureNotSupported'), preferred) };
  }
  const cappedEnd = range.end > now ? now : range.end;
  const cappedRange = { start: range.start, end: cappedEnd };
  const explicitSubject = /\b(about|subject|titled|called|with|regarding|keyword)\b/i.test(englishText);
  const subjectCandidate = stripDateNoise(nlu?.subject ?? fallbackRange.remainder);
  const subjectQuery = explicitSubject && subjectCandidate.length >= 3 ? subjectCandidate : '';
  const { agendaService } = buildGraphServicesForRequest(request);
  let agenda;
  try {
    agenda = await agendaService.searchAgenda({
      ...formatDateRange(cappedRange),
      subjectContains: subjectQuery || undefined,
      includeTranscriptAvailability: true,
      top: 10
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : t('agenda.searchFailed');
    return {
      text: await translateOutgoing(t('agenda.cannotAccess', { message }), preferred)
    };
  }
  const items = agenda.items as AgendaItem[];
  if (isLogEnabled(request)) {
    logEvent(request, 'agenda_result', {
      rangeStart: cappedRange.start.toISOString(),
      rangeEnd: cappedRange.end.toISOString(),
      subjectQuery,
      totalItems: items.length,
      joinUrlCount: items.filter((item) => item.joinUrl).length,
      transcriptCount: items.filter((item) => item.transcriptAvailable).length
    });
  }
  if (!items.length) {
    return {
      text: await translateOutgoing(t('agenda.none', { range: formatRangeLabel(cappedRange) }), preferred)
    };
  }
  const filtered = items.filter((item) => {
    const start = item.start ? new Date(item.start) : undefined;
    return item.transcriptAvailable && (!start || start <= now);
  });
  if (!filtered.length) {
    return {
      text: await translateOutgoing(t('agenda.noneWithTranscript', { range: formatRangeLabel(cappedRange) }), preferred)
    };
  }
  const formatted = filtered.map((item, index) => {
    const display = formatAgendaItem(item, t);
    return { index: index + 1, title: display.title, details: display.details, agendaItem: item };
  });
  const untitled = t('agenda.untitled');
  const localizedItems = await Promise.all(
    formatted.map(async (item) => ({
      ...item,
      title: item.title === untitled ? await translateOutgoing(item.title, preferred) : item.title,
      details: await translateOutgoing(item.details, preferred)
    }))
  );
  selectionStore.set(request.conversationId, { items: localizedItems });
  return {
    text: await translateOutgoing(t('agenda.intro'), preferred),
    metadata: {
      adaptiveCard: JSON.stringify(buildAgendaCard(await translateOutgoing(t('agenda.title'), preferred), localizedItems))
    }
  };
};

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
