import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import express, { Request, Response } from 'express';
import {
  TeamsActivityHandler,
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
  TurnContext
} from 'botbuilder';
import { Attachment, Mention } from 'botframework-schema';
import {
  AgendaService,
  AzureOpenAiClient,
  CalendarService,
  GraphClient,
  MeetingTranscriptService,
  OnlineMeetingService,
  QaService,
  SummarizationService,
  TranscriptService
} from '../src/index.js';
import { TranslationService } from '../src/llm/translationService.js';
import type { NluResult } from '../src/teams/nluService.js';
import { NluService } from '../src/teams/nluService.js';
import { LanguageCode, extractLanguageToken, languageNames, normalizeLanguage } from '../src/teams/language.js';
import { TeamsCommandRouter } from '../src/teams/router.js';
import { ChannelRequest } from '../src/teams/types.js';

const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing ${key} environment variable.`);
  }
  return value;
};

const port = Number(process.env.BOT_PORT ?? process.env.PORT ?? 3978);
const endpointPath = process.env.BOT_ENDPOINT_PATH ?? '/api/messages';
const botMentionText = process.env.BOT_MENTION_TEXT;
const graphBaseUrl = process.env.GRAPH_BASE_URL ?? 'https://graph.microsoft.com/v1.0';
const graphAccessToken = process.env.GRAPH_ACCESS_TOKEN;
const oauthConnection = process.env.BOT_OAUTH_CONNECTION;
const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

const botFrameworkAuthentication = new ConfigurationBotFrameworkAuthentication({
  MicrosoftAppId: requireEnv('TEAMS_BOT_ID'),
  MicrosoftAppPassword: requireEnv('TEAMS_APP_PASSWORD'),
  MicrosoftAppType: process.env.MICROSOFT_APP_TYPE ?? 'SingleTenant',
  MicrosoftAppTenantId: process.env.MICROSOFT_APP_TENANT_ID ?? process.env.AZURE_TENANT_ID
});
const adapter = new CloudAdapter(botFrameworkAuthentication);

const buildTranscript = async (): Promise<{ raw: string; cues: [] }> => {
  if (process.env.BOT_TRANSCRIPT_TEXT) {
    return { raw: process.env.BOT_TRANSCRIPT_TEXT, cues: [] };
  }
  if (process.env.BOT_TRANSCRIPT_FILE) {
    const text = await fs.readFile(process.env.BOT_TRANSCRIPT_FILE, 'utf8');
    return { raw: text, cues: [] };
  }
  return { raw: '', cues: [] };
};

const getGraphTokenForRequest = async (request: ChannelRequest): Promise<string> => {
  if (graphAccessToken) {
    return graphAccessToken;
  }
  if (request.graphToken) {
    return request.graphToken;
  }
  throw new Error('Missing Graph token for this user.');
};

const buildGraphServicesForRequest = (request: ChannelRequest) => {
  const graphClient = new GraphClient({
    baseUrl: graphBaseUrl,
    tokenProvider: () => getGraphTokenForRequest(request)
  });
  const calendarService = new CalendarService({ graphClient });
  const onlineMeetingService = new OnlineMeetingService({ graphClient });
  const transcriptService = new TranscriptService({ graphClient });
  const agendaService = new AgendaService({
    calendarService,
    onlineMeetingService,
    transcriptService
  });
  return { agendaService, onlineMeetingService, transcriptService };
};

const buildLlmClient = () => {
  return new AzureOpenAiClient({
    endpoint: requireEnv('AZURE_OPENAI_ENDPOINT'),
    apiKey: requireEnv('AZURE_OPENAI_API_KEY'),
    deployment: requireEnv('AZURE_OPENAI_DEPLOYMENT'),
    apiVersion: requireEnv('AZURE_OPENAI_API_VERSION')
  });
};

const getTranslationService = (): TranslationService | undefined => {
  if (translationService) {
    return translationService;
  }
  try {
    translationService = new TranslationService({ client: buildLlmClient() });
    return translationService;
  } catch {
    return undefined;
  }
};

const getNluService = (): NluService | undefined => {
  if (nluService) {
    return nluService;
  }
  try {
    nluService = new NluService({ client: buildLlmClient() });
    return nluService;
  } catch {
    return undefined;
  }
};

const protectCommandTokens = (text: string) => {
  const tokens: string[] = [];
  const protectedText = text.replace(/\/[a-z0-9_-]+/gi, (match) => {
    const key = `__CMD${tokens.length}__`;
    tokens.push(match);
    return key;
  });
  return { protectedText, tokens };
};

const restoreCommandTokens = (text: string, tokens: string[]) => {
  return tokens.reduce((value, token, index) => value.replaceAll(`__CMD${index}__`, token), text);
};

const translateOutgoing = async (text: string, language: LanguageCode): Promise<string> => {
  if (!text.trim() || language === 'en') {
    return text;
  }
  const service = getTranslationService();
  if (!service) {
    return text;
  }
  const protectedText = protectCommandTokens(text);
  const translated = await service.translate(protectedText.protectedText, language);
  return restoreCommandTokens(translated, protectedText.tokens);
};

const translateToEnglish = async (text: string, language: LanguageCode): Promise<string> => {
  if (!text.trim() || language === 'en') {
    return text;
  }
  const service = getTranslationService();
  if (!service) {
    return text;
  }
  const protectedText = protectCommandTokens(text);
  const translated = await service.translate(protectedText.protectedText, 'en');
  return restoreCommandTokens(translated, protectedText.tokens);
};

const buildSignInResponse = async (request: ChannelRequest, language: LanguageCode) => {
  const text = await translateOutgoing(t('auth.signIn'), language);
  const metadata = request.signInLink
    ? {
        signinLink: request.signInLink,
        followupText: await translateOutgoing(t('auth.waitingForCode'), language)
      }
    : undefined;
  return { text, metadata };
};

const getLanguageKey = (request: ChannelRequest) => {
  const user = request.fromUserId || 'anonymous';
  return `${request.conversationId}:${user}`;
};

const getLogKey = (request: ChannelRequest) => getLanguageKey(request);

const isLogEnabled = (request: ChannelRequest) => logStore.get(getLogKey(request)) ?? false;

const isLogoutCommand = (text: string) => text.trim().toLowerCase().startsWith('/logout');

const isLikelyEnglishText = (text?: string) => {
  if (!text) {
    return false;
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  const asciiOnly = /^[\x00-\x7F]*$/.test(trimmed);
  if (!asciiOnly) {
    return false;
  }
  return trimmed.length <= 20 || /^[a-z0-9\s.,!?'"-]+$/i.test(trimmed);
};

const hasNonAscii = (text?: string) => {
  if (!text) {
    return false;
  }
  return /[^\x00-\x7F]/.test(text);
};

const resolvePreferredLanguage = async (
  request: ChannelRequest,
  explicit?: LanguageCode
): Promise<LanguageCode> => {
  if (explicit) {
    languageStore.set(getLanguageKey(request), explicit);
    return explicit;
  }
  const stored = languageStore.get(getLanguageKey(request));
  if (stored) {
    return stored;
  }
  const locale = normalizeLanguage(request.locale);
  if (locale) {
    if (isLikelyEnglishText(request.text)) {
      return 'en';
    }
    return locale;
  }
  if (hasNonAscii(request.text)) {
    const service = getTranslationService();
    if (service && request.text) {
      try {
        const detected = normalizeLanguage(await service.detectLanguage(request.text)) ?? 'en';
        languageStore.set(getLanguageKey(request), detected);
        return detected;
      } catch {
        return 'en';
      }
    }
  }
  return 'en';
};


type TranslationCatalog = Record<string, unknown>;
const languageStore = new Map<string, LanguageCode>();
const selectionStore = new Map<
  string,
  { items: { index: number; title: string; details: string; agendaItem: import('../src/agenda/types.js').AgendaItem }[] }
>();
const logStore = new Map<string, boolean>();
let translationService: TranslationService | undefined;
let nluService: NluService | undefined;

const getMeetingTranscriptService = (request: ChannelRequest) => {
  const { onlineMeetingService, transcriptService } = buildGraphServicesForRequest(request);
  return { onlineMeetingService, transcriptService };
};

const buildAgendaCard = (title: string, items: { index: number; title: string; details: string }[]) => {
  return {
    contentType: 'application/vnd.microsoft.card.adaptive',
    content: {
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        {
          type: 'TextBlock',
          text: title,
          weight: 'Bolder',
          size: 'Medium'
        },
        ...items.flatMap((item) => [
          {
            type: 'TextBlock',
            text: `${item.index}. ${item.title}`,
            weight: 'Bolder',
            wrap: true
          },
          {
            type: 'TextBlock',
            text: item.details,
            isSubtle: true,
            wrap: true,
            spacing: 'Small'
          }
        ])
      ],
      actions: items.map((item) => ({
        type: 'Action.Submit',
        title: `${item.index}. ${item.title}`,
        data: { command: 'select', selection: String(item.index) }
      }))
    }
  };
};

const buildSignInCard = (prompt: string, cta: string, signInLink: string) => {
  return {
    contentType: 'application/vnd.microsoft.card.adaptive',
    content: {
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        {
          type: 'TextBlock',
          text: prompt,
          wrap: true
        }
      ],
      actions: [
        {
          type: 'Action.OpenUrl',
          title: cta,
          url: signInLink
        }
      ]
    }
  };
};

const isAgendaIntent = (text: string): boolean => {
  const lower = text.toLowerCase();
  return (
    lower.includes('agenda') ||
    lower.includes('calendar') ||
    lower.includes('meetings') ||
    lower.includes('check my agenda') ||
    lower.includes('mi agenda') ||
    lower.includes('mi calendario') ||
    lower.includes('reuniones') ||
    lower.includes('agenda mea') ||
    lower.includes('calendarul meu') ||
    lower.includes('intalniri')
  );
};

const loadTranslations = async (): Promise<TranslationCatalog> => {
  const root = path.resolve(process.cwd(), 'src', 'i18n');
  const enRaw = await fs.readFile(path.join(root, 'en.json'), 'utf8');
  return JSON.parse(enRaw) as TranslationCatalog;
};

const runGraphDebug = async (request: ChannelRequest) => {
  const graphClient = new GraphClient({
    baseUrl: graphBaseUrl,
    tokenProvider: () => getGraphTokenForRequest(request)
  });
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 7);
  const end = new Date(now);
  end.setDate(end.getDate() + 1);
  try {
    await graphClient.get('/me', undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return { ok: false, error: message };
  }
  try {
    const { agendaService } = buildGraphServicesForRequest(request);
    const agenda = await agendaService.searchAgenda({
      startDateTime: start.toISOString(),
      endDateTime: end.toISOString(),
      includeTranscriptAvailability: true,
      top: 10
    });
    const count = agenda.items.length;
    const withJoinUrl = agenda.items.filter((item) => Boolean(item.joinUrl)).length;
    const withTranscript = agenda.items.filter((item) => item.transcriptAvailable).length;
    return { ok: true, count, start, end, withJoinUrl, withTranscript };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return { ok: false, error: message };
  }
};

const translations = await loadTranslations();

const t = (keyPath: string, vars?: Record<string, string>): string => {
  const value = keyPath.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, translations);
  if (typeof value !== 'string') {
    return keyPath;
  }
  if (!vars) {
    return value;
  }
  return Object.entries(vars).reduce((text, [varKey, varValue]) => {
    return text.replaceAll(`{${varKey}}`, varValue);
  }, value);
};

const buildHelpText = (): string => {
  return [
    t('help.title'),
    t('help.overview'),
    '',
    t('help.commandsTitle'),
    t('help.agenda'),
    t('help.select'),
    t('help.summary'),
    t('help.qa'),
    t('help.language'),
    t('help.how'),
    t('help.contribute'),
    t('help.help'),
    t('help.whoami'),
    t('help.graphdebug'),
    t('help.logs'),
    t('help.logout'),
    '',
    t('help.examplesTitle'),
    t('help.examples')
  ].join('\n');
};

const formatDateRange = (range: { start: Date; end: Date }) => ({
  startDateTime: range.start.toISOString(),
  endDateTime: range.end.toISOString()
});

const parseAgendaRange = (text: string): { start: Date; end: Date; remainder: string } => {
  const now = new Date();
  const tokens = text.toLowerCase();
  const explicit = parseExplicitDate(tokens);
  if (explicit) {
    return explicit;
  }
  const relativeWeekday = parseRelativeWeekday(tokens, now);
  if (relativeWeekday) {
    return relativeWeekday;
  }
  const relativeDays = parseRelativeDays(tokens, now);
  if (relativeDays) {
    return relativeDays;
  }
  if (tokens.includes('yesterday') || tokens.includes('ayer') || tokens.includes('ieri')) {
    const start = new Date(now);
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end, remainder: text.replace(/yesterday|ayer|ieri/gi, '').trim() };
  }
  if (tokens.includes('today') || tokens.includes('hoy') || tokens.includes('azi')) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end, remainder: text.replace(/today|hoy|azi/gi, '').trim() };
  }
  if (tokens.includes('tomorrow') || tokens.includes('manana') || tokens.includes('maine')) {
    const start = new Date(now);
    start.setDate(start.getDate() + 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end, remainder: text.replace(/tomorrow|manana|maine/gi, '').trim() };
  }
  if (tokens.includes('week') || tokens.includes('semana') || tokens.includes('saptamana')) {
    const start = new Date(now);
    const end = new Date(now);
    end.setDate(end.getDate() + 7);
    return { start, end, remainder: text.replace(/week|semana|saptamana/gi, '').trim() };
  }
  const start = new Date(now);
  const end = new Date(now);
  end.setDate(end.getDate() + 7);
  return { start, end, remainder: text.trim() };
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

const stripDateNoise = (value?: string): string => {
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

const formatRangeLabel = (range: { start: Date; end: Date }) => {
  const start = range.start;
  const endInclusive = new Date(range.end.getTime() - 1);
  const end = endInclusive < start ? start : endInclusive;
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  const formatDate = (value: Date) =>
    value.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  if (sameDay) {
    return formatDate(start);
  }
  return `${formatDate(start)} to ${formatDate(end)}`;
};

const resolveDateRangeFromNlu = (nlu?: NluResult): { start: Date; end: Date } | undefined => {
  if (!nlu?.dateRange?.startDateTime || !nlu?.dateRange?.endDateTime) {
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

const findClosestMeetingByTime = (
  items: import('../src/agenda/types.js').AgendaItem[],
  targetMinutes?: number
) => {
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

const findMeetingFromNlu = async (
  request: ChannelRequest,
  englishText: string,
  nlu: NluResult | undefined,
  requireTranscript: boolean
): Promise<import('../src/agenda/types.js').AgendaItem | undefined> => {
  const fallbackRange = parseAgendaRange(englishText);
  const nluRange = resolveDateRangeFromNlu(nlu);
  const range = nluRange ?? { start: fallbackRange.start, end: fallbackRange.end };
  const explicitSubject =
    /\b(about|subject|titled|called|with|regarding|keyword)\b/i.test(englishText);
  const subjectCandidate = stripDateNoise(nlu?.subject ?? fallbackRange.remainder);
  const subjectQuery = explicitSubject && subjectCandidate.length >= 3 ? subjectCandidate : '';
  const { agendaService } = buildGraphServicesForRequest(request);
  const agenda = await agendaService.searchAgenda({
    ...formatDateRange(range),
    subjectContains: subjectQuery || undefined,
    includeTranscriptAvailability: true,
    top: 10
  });
  let items = agenda.items;
  if (requireTranscript) {
    items = items.filter((item) => item.transcriptAvailable);
  }
  if (!items.length) {
    return undefined;
  }
  const targetMinutes = parseTimeToMinutes(nlu?.time);
  return findClosestMeetingByTime(items, targetMinutes);
};

const getTranscriptFromMeetingContext = async (request: ChannelRequest) => {
  if (!request.meetingId && !request.meetingJoinUrl) {
    return undefined;
  }
  const { onlineMeetingService, transcriptService } = getMeetingTranscriptService(request);
  const transcriptLookup = new MeetingTranscriptService({
    onlineMeetingService,
    transcriptService
  });
  return transcriptLookup.getTranscriptForMeetingContext({
    meetingId: request.meetingId,
    joinUrl: request.meetingJoinUrl
  });
};

const formatAgendaItem = (item: import('../src/agenda/types.js').AgendaItem) => {
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

const isHowIntent = (text: string): boolean => {
  const lower = text.toLowerCase();
  return (
    lower.includes('how you work') ||
    lower.includes('how it works') ||
    lower.includes('how do you work') ||
    lower.includes('como funciona') ||
    lower.includes('como trabajas') ||
    lower.includes('cum functioneaza') ||
    lower.includes('cum functionezi')
  );
};

const isHelpIntent = (text: string): boolean => {
  const lower = text.toLowerCase();
  return lower.includes('help') || lower.includes('ajutor') || lower.includes('ayuda');
};

const isWhoamiIntent = (text: string): boolean => {
  const lower = text.toLowerCase();
  return lower.includes('whoami') || lower.includes('who am i');
};

const isGraphDebugIntent = (text: string): boolean => {
  const lower = text.toLowerCase();
  return lower.includes('graph debug') || lower.includes('graphstatus') || lower.includes('graph status');
};

const isTodayIntent = (text: string): boolean => {
  const lower = text.toLowerCase();
  return (
    lower.includes('today is') ||
    lower.includes('what day is it') ||
    lower.includes('what is the date') ||
    lower.trim() === 'today' ||
    lower.trim() === 'date'
  );
};

const isContributeIntent = (text: string): boolean => {
  const lower = text.toLowerCase();
  return (
    lower.includes('contribute') ||
    lower.includes('contributing') ||
    lower.includes('improve') ||
    lower.includes('github') ||
    lower.includes('repo')
  );
};

const handleAgendaRequest = async (request: ChannelRequest) => {
  const { language, remainder } = extractLanguageToken(request.text ?? '');
  const preferred = await resolvePreferredLanguage(request, language);
  const userText = remainder || request.text || '';
  const englishText = await translateToEnglish(userText, preferred);
  const nlu = await getNluService()?.parse(englishText, new Date(), systemTimeZone);
  if (!request.graphToken && !graphAccessToken) {
    return buildSignInResponse(request, preferred);
  }
  const explicitSubject =
    /\b(about|subject|titled|called|with|regarding|keyword)\b/i.test(englishText);
  const fallbackRange = parseAgendaRange(englishText);
  const nluRange = resolveDateRangeFromNlu(nlu);
  const range = nluRange ?? { start: fallbackRange.start, end: fallbackRange.end };
  const subjectCandidate = stripDateNoise(nlu?.subject ?? fallbackRange.remainder);
  const subjectQuery = explicitSubject && subjectCandidate.length >= 3 ? subjectCandidate : '';
  const { agendaService } = buildGraphServicesForRequest(request);
  let agenda;
  try {
    agenda = await agendaService.searchAgenda({
      ...formatDateRange(range),
      subjectContains: subjectQuery || undefined,
      includeTranscriptAvailability: true,
      top: 10
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Agenda search failed.';
    return {
      text: await translateOutgoing(t('agenda.cannotAccess', { message }), preferred)
    };
  }
  if (isLogEnabled(request)) {
  console.log('[debug] agenda range', range.start.toISOString(), range.end.toISOString());
  console.log('[debug] agenda subject', subjectQuery || '');
  console.log('[debug] agenda subject explicit', explicitSubject);
    console.log('[debug] agenda total items', agenda.items.length);
    console.log('[debug] agenda joinUrl count', agenda.items.filter((item) => item.joinUrl).length);
    console.log('[debug] agenda transcript count', agenda.items.filter((item) => item.transcriptAvailable).length);
  }
  if (!agenda.items.length) {
    return {
      text: await translateOutgoing(t('agenda.none', { range: formatRangeLabel(range) }), preferred)
    };
  }
  const filtered = agenda.items.filter((item) => item.transcriptAvailable);
  if (!filtered.length) {
    return {
      text: await translateOutgoing(t('agenda.noneWithTranscript', { range: formatRangeLabel(range) }), preferred)
    };
  }
  const formatted = filtered.map((item, index) => {
    const display = formatAgendaItem(item);
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

const router = new TeamsCommandRouter({
  botMentionText,
  routes: [
    {
      command: 'help',
      handler: async (request) => {
        const language = await resolvePreferredLanguage(request);
        return { text: await translateOutgoing(buildHelpText(), language) };
      }
    },
    {
      command: 'whoami',
      handler: async (request) => {
        const language = await resolvePreferredLanguage(request);
        const lines = [
          t('debug.title'),
          t('debug.user', { value: request.fromUserId || 'unknown' }),
          t('debug.tenant', { value: request.tenantId || 'unknown' }),
          t('debug.graphToken', { value: request.graphToken ? 'present' : 'missing' }),
          t('debug.oauth', { value: oauthConnection || 'not-configured' })
        ];
        return { text: await translateOutgoing(lines.join('\n'), language) };
      }
    },
    {
      command: 'logs',
      handler: async (request) => {
        const language = await resolvePreferredLanguage(request);
        const action = request.text.trim().toLowerCase();
        if (action === 'on') {
          logStore.set(getLogKey(request), true);
          return { text: await translateOutgoing(t('logs.enabled'), language) };
        }
        if (action === 'off') {
          logStore.set(getLogKey(request), false);
          return { text: await translateOutgoing(t('logs.disabled'), language) };
        }
        const status = isLogEnabled(request) ? t('logs.statusOn') : t('logs.statusOff');
        return { text: await translateOutgoing(status, language) };
      }
    },
    {
      command: 'graphdebug',
      handler: async (request) => {
        const language = await resolvePreferredLanguage(request);
        if (!request.graphToken && !graphAccessToken) {
          return buildSignInResponse(request, language);
        }
        const debug = await runGraphDebug(request);
        if (!debug.ok) {
          return { text: await translateOutgoing(t('debug.graphError', { message: debug.error ?? 'unknown' }), language) };
        }
        return {
          text: await translateOutgoing(
            t('debug.graphOk', {
              count: String(debug.count ?? 0),
              range: `${debug.start?.toISOString()} -> ${debug.end?.toISOString()}`,
              withJoinUrl: String(debug.withJoinUrl ?? 0),
              withTranscript: String(debug.withTranscript ?? 0)
            }),
            language
          )
        };
      }
    },
    {
      command: 'how',
      handler: async (request) => {
        const language = await resolvePreferredLanguage(request);
        return { text: await translateOutgoing(t('howItWorks'), language) };
      }
    },
    {
      command: 'contribute',
      handler: async (request) => {
        const language = await resolvePreferredLanguage(request);
        return {
          text: await translateOutgoing(
            t('contribute', { repoUrl: 'https://github.com/PlainConceptsGC/teams-meetinglens' }),
            language
          )
        };
      }
    },
    {
      command: 'language',
      handler: async (request) => {
        const { language } = extractLanguageToken(request.text ?? '');
        if (!language) {
          const preferred = await resolvePreferredLanguage(request);
          return { text: await translateOutgoing(t('languagePrompt'), preferred) };
        }
        languageStore.set(getLanguageKey(request), language);
        const languageLabel = languageNames[language] ?? language;
        return { text: await translateOutgoing(t('languageSet', { languageName: languageLabel }), language) };
      }
    },
    {
      command: 'agenda',
      handler: async (request) => handleAgendaRequest(request)
    },
    {
      command: 'select',
      handler: async (request) => {
        const selection = request.text.trim();
        const store = selectionStore.get(request.conversationId);
        if (!store) {
          const language = await resolvePreferredLanguage(request);
          return { text: await translateOutgoing(t('selection.needAgenda'), language) };
        }
        const index = Number(selection);
        if (!Number.isFinite(index) || index < 1 || index > store.items.length) {
          const language = await resolvePreferredLanguage(request);
          return { text: await translateOutgoing(t('selection.invalid'), language) };
        }
        const selected = store.items[index - 1];
        selectionStore.set(request.conversationId, { items: [selected] });
        const language = await resolvePreferredLanguage(request);
        return {
          text: await translateOutgoing(t('selection.selected', { title: selected.title }), language)
        };
      }
    },
    {
      command: 'summary',
      handler: async (request) => {
        const { language } = extractLanguageToken(request.text ?? '');
        const preferred = await resolvePreferredLanguage(request, language);
        if (!request.graphToken && !graphAccessToken) {
          return buildSignInResponse(request, preferred);
        }
        const store = selectionStore.get(request.conversationId);
        if (!store || !store.items.length) {
          try {
            const transcript = await getTranscriptFromMeetingContext(request);
            if (transcript?.raw) {
              const client = buildLlmClient();
              const summarizer = new SummarizationService({ client });
              const result = await summarizer.summarize(transcript, { language: 'en' });
              return { text: await translateOutgoing(result.summary, preferred) };
            }
          } catch {
            return { text: await translateOutgoing(t('transcript.notAvailable'), preferred) };
          }
          const transcript = await buildTranscript();
          if (!transcript.raw) {
            return {
              text: await translateOutgoing(t('transcript.notConfigured'), preferred)
            };
          }
          const client = buildLlmClient();
          const summarizer = new SummarizationService({ client });
          const result = await summarizer.summarize(transcript, { language: 'en' });
          return { text: await translateOutgoing(result.summary, preferred) };
        }

        const selected = store.items[0].agendaItem;
        const { onlineMeetingService, transcriptService } = getMeetingTranscriptService(request);
        let transcript;
        try {
          const transcriptLookup = new MeetingTranscriptService({
            onlineMeetingService,
            transcriptService
          });
          transcript = await transcriptLookup.getTranscriptForAgendaItem(selected);
        } catch {
          return {
            text: await translateOutgoing(t('transcript.notAvailable'), preferred)
          };
        }
        const client = buildLlmClient();
        const summarizer = new SummarizationService({ client });
        const result = await summarizer.summarize(transcript, { language: 'en' });
        return { text: await translateOutgoing(result.summary, preferred) };
      }
    },
    {
      command: 'qa',
      handler: async (request) => {
        const { language, remainder } = extractLanguageToken(request.text ?? '');
        const preferred = await resolvePreferredLanguage(request, language);
        if (!request.graphToken && !graphAccessToken) {
          return buildSignInResponse(request, preferred);
        }
        const question = remainder || request.text;
        const englishQuestion = await translateToEnglish(question, preferred);
        const store = selectionStore.get(request.conversationId);
        if (!store || !store.items.length) {
          try {
            const transcript = await getTranscriptFromMeetingContext(request);
            if (transcript?.raw) {
              const client = buildLlmClient();
              const qa = new QaService({ client });
              const result = await qa.answerQuestion(englishQuestion, transcript, { language: 'en' });
              return { text: await translateOutgoing(result.answer, preferred) };
            }
          } catch {
            return { text: await translateOutgoing(t('transcript.notAvailable'), preferred) };
          }
          const transcript = await buildTranscript();
          if (!transcript.raw) {
            return {
              text: await translateOutgoing(t('transcript.notConfigured'), preferred)
            };
          }
          const client = buildLlmClient();
          const qa = new QaService({ client });
          const result = await qa.answerQuestion(englishQuestion, transcript, { language: 'en' });
          return { text: await translateOutgoing(result.answer, preferred) };
        }
        const selected = store.items[0].agendaItem;
        const { onlineMeetingService, transcriptService } = getMeetingTranscriptService(request);
        let transcript;
        try {
          const transcriptLookup = new MeetingTranscriptService({
            onlineMeetingService,
            transcriptService
          });
          transcript = await transcriptLookup.getTranscriptForAgendaItem(selected);
        } catch {
          return {
            text: await translateOutgoing(t('transcript.notAvailable'), preferred)
          };
        }
        const client = buildLlmClient();
        const qa = new QaService({ client });
        const result = await qa.answerQuestion(englishQuestion, transcript, { language: 'en' });
        return { text: await translateOutgoing(result.answer, preferred) };
      }
    }
  ],
  defaultHandler: async (request) => {
    const { language } = extractLanguageToken(request.text ?? '');
    const preferred = await resolvePreferredLanguage(request, language);
    const englishText = await translateToEnglish(request.text ?? '', preferred);
    const nlu = await getNluService()?.parse(englishText, new Date(), systemTimeZone);
    const intent = nlu?.intent ?? 'unknown';

    if (intent === 'agenda' || isAgendaIntent(englishText)) {
      return handleAgendaRequest(request);
    }
    if (intent === 'how' || isHowIntent(englishText)) {
      return { text: await translateOutgoing(t('howItWorks'), preferred) };
    }
    if (intent === 'help' || isHelpIntent(englishText)) {
      return { text: await translateOutgoing(buildHelpText(), preferred) };
    }
    if (isWhoamiIntent(englishText)) {
      const lines = [
        t('debug.title'),
        t('debug.user', { value: request.fromUserId || 'unknown' }),
        t('debug.tenant', { value: request.tenantId || 'unknown' }),
        t('debug.graphToken', { value: request.graphToken ? 'present' : 'missing' }),
        t('debug.oauth', { value: oauthConnection || 'not-configured' })
      ];
      return { text: await translateOutgoing(lines.join('\n'), preferred) };
    }
    if (isGraphDebugIntent(englishText)) {
      if (!request.graphToken && !graphAccessToken) {
        return buildSignInResponse(request, preferred);
      }
      const debug = await runGraphDebug(request);
      if (!debug.ok) {
        return { text: await translateOutgoing(t('debug.graphError', { message: debug.error ?? 'unknown' }), preferred) };
      }
      return {
        text: await translateOutgoing(
          t('debug.graphOk', {
            count: String(debug.count ?? 0),
            range: `${debug.start?.toISOString()} -> ${debug.end?.toISOString()}`,
            withJoinUrl: String(debug.withJoinUrl ?? 0),
            withTranscript: String(debug.withTranscript ?? 0)
          }),
          preferred
        )
      };
    }
    if (englishText.trim().toLowerCase().startsWith('/logs')) {
      const rest = englishText.replace(/^\/logs\s*/i, '').trim().toLowerCase();
      if (rest === 'on') {
        logStore.set(getLogKey(request), true);
        return { text: await translateOutgoing(t('logs.enabled'), preferred) };
      }
      if (rest === 'off') {
        logStore.set(getLogKey(request), false);
        return { text: await translateOutgoing(t('logs.disabled'), preferred) };
      }
      const status = isLogEnabled(request) ? t('logs.statusOn') : t('logs.statusOff');
      return { text: await translateOutgoing(status, preferred) };
    }
    if (isTodayIntent(englishText)) {
      const today = new Date();
      const formatted = today.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      return { text: await translateOutgoing(t('date.today', { date: formatted }), preferred) };
    }
    if (intent === 'contribute' || isContributeIntent(englishText)) {
      return {
        text: await translateOutgoing(
          t('contribute', { repoUrl: 'https://github.com/PlainConceptsGC/teams-meetinglens' }),
          preferred
        )
      };
    }

    if (intent === 'summary') {
      if (!request.graphToken && !graphAccessToken) {
        return buildSignInResponse(request, preferred);
      }
      const store = selectionStore.get(request.conversationId);
      const selected = store?.items?.[0]?.agendaItem;
      try {
        const transcriptFromContext = await getTranscriptFromMeetingContext(request);
        if (transcriptFromContext?.raw) {
          const client = buildLlmClient();
          const summarizer = new SummarizationService({ client });
          const result = await summarizer.summarize(transcriptFromContext, { language: 'en' });
          return { text: await translateOutgoing(result.summary, preferred) };
        }
      } catch {
        return { text: await translateOutgoing(t('transcript.notAvailable'), preferred) };
      }

      const meeting = selected ?? (await findMeetingFromNlu(request, englishText, nlu, true));
      if (!meeting) {
        return { text: await translateOutgoing(t('meeting.notFound'), preferred) };
      }
      const { onlineMeetingService, transcriptService } = getMeetingTranscriptService(request);
      let transcript;
      try {
        const transcriptLookup = new MeetingTranscriptService({
          onlineMeetingService,
          transcriptService
        });
        transcript = await transcriptLookup.getTranscriptForAgendaItem(meeting);
      } catch {
        return { text: await translateOutgoing(t('transcript.notAvailable'), preferred) };
      }
      const client = buildLlmClient();
      const summarizer = new SummarizationService({ client });
      const result = await summarizer.summarize(transcript, { language: 'en' });
      return { text: await translateOutgoing(result.summary, preferred) };
    }

    if (intent === 'qa') {
      if (!request.graphToken && !graphAccessToken) {
        return buildSignInResponse(request, preferred);
      }
      const question = nlu?.question ?? englishText;
      const store = selectionStore.get(request.conversationId);
      const selected = store?.items?.[0]?.agendaItem;
      try {
        const transcriptFromContext = await getTranscriptFromMeetingContext(request);
        if (transcriptFromContext?.raw) {
          const client = buildLlmClient();
          const qa = new QaService({ client });
          const result = await qa.answerQuestion(question, transcriptFromContext, { language: 'en' });
          return { text: await translateOutgoing(result.answer, preferred) };
        }
      } catch {
        return { text: await translateOutgoing(t('transcript.notAvailable'), preferred) };
      }

      const meeting = selected ?? (await findMeetingFromNlu(request, englishText, nlu, true));
      if (meeting) {
        const { onlineMeetingService, transcriptService } = getMeetingTranscriptService(request);
        let transcript;
        try {
          const transcriptLookup = new MeetingTranscriptService({
            onlineMeetingService,
            transcriptService
          });
          transcript = await transcriptLookup.getTranscriptForAgendaItem(meeting);
        } catch {
          return { text: await translateOutgoing(t('transcript.notAvailable'), preferred) };
        }
        const client = buildLlmClient();
        const qa = new QaService({ client });
        const result = await qa.answerQuestion(question, transcript, { language: 'en' });
        return { text: await translateOutgoing(result.answer, preferred) };
      }

      const transcript = await buildTranscript();
      if (transcript.raw) {
        const client = buildLlmClient();
        const qa = new QaService({ client });
        const result = await qa.answerQuestion(question, transcript, { language: 'en' });
        return { text: await translateOutgoing(result.answer, preferred) };
      }

      return { text: await translateOutgoing(t('meeting.notFound'), preferred) };
    }

    return { text: await translateOutgoing(t('fallback.unknown'), preferred) };
  }
});

type ActivityAttachment = Attachment & { contentLength?: number };

class TeamsBot extends TeamsActivityHandler {
  constructor() {
    super();
    this.onMessage(async (context: TurnContext, next: () => Promise<void>) => {
      const activity = context.activity;
      const value = activity.value as { command?: string; selection?: string } | undefined;
      const commandText =
        value?.command === 'select' && value.selection ? `/select ${value.selection}` : undefined;
      const incomingText = commandText ?? activity.text ?? '';
      const fromAadObjectId = (activity.from as { aadObjectId?: string } | undefined)?.aadObjectId;
      let graphToken: string | undefined;
      let signInLink: string | undefined;
      const magicCodeMatch = (activity.text ?? '').trim().match(/^\d{6}$/);
      const magicCode = magicCodeMatch ? magicCodeMatch[0] : '';
      if (oauthConnection) {
        const claimsIdentity = context.turnState.get(adapter.BotIdentityKey);
        if (claimsIdentity) {
          try {
            const userTokenClient = await botFrameworkAuthentication.createUserTokenClient(claimsIdentity);
            const token = await userTokenClient.getUserToken(
              activity.from?.id ?? '',
              oauthConnection,
              activity.channelId ?? '',
              magicCode
            );
            graphToken = token?.token;
            if (!graphToken) {
              const signInResource = await userTokenClient.getSignInResource(oauthConnection, activity, '');
              signInLink = signInResource?.signInLink;
            }
          } catch {
            graphToken = undefined;
            signInLink = undefined;
          }
        }
      }

      const request: ChannelRequest = {
        channelId: activity.channelId ?? 'msteams',
        conversationId: activity.conversation?.id ?? '',
        messageId: activity.id ?? '',
        fromUserId: fromAadObjectId ?? activity.from?.id ?? '',
        fromUserName: activity.from?.name ?? undefined,
        tenantId: activity.conversation?.tenantId ?? activity.channelData?.tenant?.id,
        text: commandText ?? activity.text ?? '',
        graphToken,
        signInLink,
        meetingId:
          (activity.channelData as { meeting?: { id?: string; meetingId?: string } } | undefined)?.meeting?.id ??
          (activity.channelData as { meeting?: { id?: string; meetingId?: string } } | undefined)?.meeting?.meetingId ??
          (activity.channelData as { meetingId?: string } | undefined)?.meetingId,
        meetingJoinUrl:
          (activity.channelData as { meeting?: { joinUrl?: string; joinWebUrl?: string } } | undefined)?.meeting
            ?.joinUrl ??
          (activity.channelData as { meeting?: { joinUrl?: string; joinWebUrl?: string } } | undefined)?.meeting
            ?.joinWebUrl ??
          (activity.channelData as { joinUrl?: string } | undefined)?.joinUrl,
        attachments: (activity.attachments as ActivityAttachment[] | undefined)?.map((attachment) => ({
          name: attachment.name,
          contentType: attachment.contentType,
          size: attachment.contentLength,
          url: attachment.contentUrl
        })),
        mentions: activity.entities
          ?.filter((entity): entity is Mention => entity.type === 'mention')
          .map((entity) => ({
            id: entity.mentioned?.id,
            name: entity.mentioned?.name,
            text: entity.text
          })),
        value,
        timestamp: activity.timestamp?.toISOString(),
        locale: activity.locale ?? (activity.channelData as { locale?: string } | undefined)?.locale ?? undefined
      };

      if (magicCodeMatch) {
        const preferred = await resolvePreferredLanguage(request);
        const message = graphToken ? t('auth.signedIn') : t('auth.codeInvalid');
        await context.sendActivity(await translateOutgoing(message, preferred));
        await next();
        return;
      }

      if (isLogoutCommand(incomingText)) {
        const preferred = await resolvePreferredLanguage(request);
        if (!oauthConnection) {
          await context.sendActivity(await translateOutgoing(t('auth.signOutNotConfigured'), preferred));
          await next();
          return;
        }
        const claimsIdentity = context.turnState.get(adapter.BotIdentityKey);
        if (!claimsIdentity) {
          await context.sendActivity(await translateOutgoing(t('auth.signOutNotConfigured'), preferred));
          await next();
          return;
        }
        try {
          const userTokenClient = await botFrameworkAuthentication.createUserTokenClient(claimsIdentity);
          await userTokenClient.signOutUser(activity.from?.id ?? '', oauthConnection, activity.channelId ?? '');
        } catch {
          await context.sendActivity(await translateOutgoing(t('auth.signOutNotConfigured'), preferred));
          await next();
          return;
        }
        await context.sendActivity(await translateOutgoing(t('auth.signedOut'), preferred));
        await next();
        return;
      }

      const response = await router.handle(request);
      const metadata = response.metadata?.adaptiveCard;
      const signIn = response.metadata?.signinLink;
      const followupText = response.metadata?.followupText;
      if (metadata) {
        await context.sendActivity({
          text: response.text,
          attachments: [JSON.parse(metadata)]
        });
      } else if (signIn) {
        await context.sendActivity({
          text: response.text,
          attachments: [buildSignInCard(response.text, t('auth.signInCta'), signIn)]
        });
        if (followupText) {
          await context.sendActivity(followupText);
        }
      } else {
        await context.sendActivity(response.text);
      }
      await next();
    });
  }
}

const bot = new TeamsBot();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.post(endpointPath, (req: Request, res: Response) => {
  adapter.process(req, res, async (turnContext) => {
    await bot.run(turnContext);
  });
});

app.listen(port, () => {
  console.log(`Bot host listening on http://localhost:${port}${endpointPath}`);
});
