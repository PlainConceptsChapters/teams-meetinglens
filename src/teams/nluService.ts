import { LlmClient } from '../llm/types.js';

export type NluIntent = 'agenda' | 'summary' | 'qa' | 'help' | 'how' | 'contribute' | 'select' | 'unknown';
export type NluMeetingRecency = 'last';

export interface NluDateRange {
  startDateTime: string;
  endDateTime: string;
}

export interface NluResult {
  intent: NluIntent;
  dateRange?: NluDateRange;
  subject?: string;
  time?: string;
  question?: string;
  meetingRecency?: NluMeetingRecency;
  selectionNumber?: number;
}

export interface NluServiceOptions {
  client: LlmClient;
}

const parseJson = <T>(input: string, fallback: T): T => {
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
};

const normalizeTime = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const match = trimmed.match(/^(\d{1,2})[:.](\d{2})$/);
  if (!match) {
    return undefined;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (Number.isNaN(hour) || Number.isNaN(minute) || hour > 23 || minute > 59) {
    return undefined;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const normalizeDateRange = (input?: NluDateRange): NluDateRange | undefined => {
  if (!input?.startDateTime || !input?.endDateTime) {
    return undefined;
  }
  const start = new Date(input.startDateTime);
  const end = new Date(input.endDateTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return undefined;
  }
  return { startDateTime: start.toISOString(), endDateTime: end.toISOString() };
};

export class NluService {
  private readonly client: LlmClient;

  constructor(options: NluServiceOptions) {
    this.client = options.client;
  }

  async parse(text: string, today: Date, timeZone?: string): Promise<NluResult> {
    const safeText = text.trim();
    if (!safeText) {
      return { intent: 'unknown' };
    }
    const prompt = [
      'You are a strict intent and entity parser for a Microsoft Teams meeting assistant.',
      'Return JSON only with this shape:',
      '{"intent":"agenda|summary|qa|help|how|contribute|select|unknown","dateRange":{"startDateTime":"ISO","endDateTime":"ISO"}|null,"subject":string|null,"time":"HH:mm"|null,"question":string|null,"meetingRecency":"last"|null,"selectionNumber":number|null}',
      'Rules:',
      '- Use intent agenda for meeting list/calendar requests.',
      '- Use intent summary for "summary", "most important", "key points", "summarize it/this/that" about a meeting.',
      '- Use intent qa when the user asks a question about a meeting content.',
      '- Use intent help/how/contribute when asked.',
      '- Use intent select when the user picks a meeting number (for example "2", "select 2").',
      '- If no clear intent, use unknown.',
      '- If date or day is mentioned, resolve to a dateRange covering that day (00:00 to 23:59).',
      '- If a time is mentioned, return it as HH:mm (24h).',
      '- If a meeting title/keyword is mentioned, put it in subject.',
      '- If the user asks for the last/most recent meeting, set meetingRecency to "last".',
      '- If the message is only a number, set intent select and selectionNumber to that number.',
      `Today is ${today.toISOString()}.`,
      timeZone ? `Assume time zone ${timeZone}.` : ''
    ]
      .filter(Boolean)
      .join('\n');

    const response = await this.client.complete([
      { role: 'system', content: prompt },
      { role: 'user', content: safeText }
    ]);

    const parsed = parseJson<Partial<NluResult>>(response, {});
    const intent =
      parsed.intent === 'agenda' ||
      parsed.intent === 'summary' ||
      parsed.intent === 'qa' ||
      parsed.intent === 'help' ||
      parsed.intent === 'how' ||
      parsed.intent === 'contribute' ||
      parsed.intent === 'select'
        ? parsed.intent
        : 'unknown';
    const selectionNumber =
      typeof parsed.selectionNumber === 'number' && Number.isFinite(parsed.selectionNumber) && parsed.selectionNumber > 0
        ? Math.floor(parsed.selectionNumber)
        : undefined;

    return {
      intent,
      dateRange: normalizeDateRange(parsed.dateRange),
      subject: parsed.subject?.trim() || undefined,
      time: normalizeTime(parsed.time),
      question: parsed.question?.trim() || undefined,
      meetingRecency: parsed.meetingRecency === 'last' ? 'last' : undefined,
      selectionNumber
    };
  }
}
