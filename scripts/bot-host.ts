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

const port = Number(process.env.BOT_PORT ?? 3978);
const endpointPath = process.env.BOT_ENDPOINT_PATH ?? '/api/messages';
const botMentionText = process.env.BOT_MENTION_TEXT;
const graphBaseUrl = process.env.GRAPH_BASE_URL ?? 'https://graph.microsoft.com/v1.0';
const graphAccessToken = process.env.GRAPH_ACCESS_TOKEN;
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

const getGraphToken = async (): Promise<string> => {
  if (!graphAccessToken) {
    throw new Error('Missing GRAPH_ACCESS_TOKEN environment variable.');
  }
  return graphAccessToken;
};

const buildGraphServices = () => {
  const graphClient = new GraphClient({
    baseUrl: graphBaseUrl,
    tokenProvider: getGraphToken
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

const resolvePreferredLanguage = async (
  request: ChannelRequest,
  explicit?: LanguageCode
): Promise<LanguageCode> => {
  if (explicit) {
    languageStore.set(request.conversationId, explicit);
    return explicit;
  }
  const stored = languageStore.get(request.conversationId);
  if (stored) {
    return stored;
  }
  const locale = normalizeLanguage(request.locale);
  if (locale) {
    return locale;
  }
  const service = getTranslationService();
  if (service && request.text) {
    try {
      const detected = normalizeLanguage(await service.detectLanguage(request.text)) ?? 'en';
      languageStore.set(request.conversationId, detected);
      return detected;
    } catch {
      return 'en';
    }
  }
  return 'en';
};


type TranslationCatalog = Record<string, unknown>;
const languageStore = new Map<string, LanguageCode>();
const agendaStore = new Map<string, AgendaService>();
const selectionStore = new Map<
  string,
  { items: { index: number; title: string; details: string; agendaItem: import('../src/agenda/types.js').AgendaItem }[] }
>();
let translationService: TranslationService | undefined;
let nluService: NluService | undefined;

const getAgendaService = (): AgendaService => {
  const existing = agendaStore.get('default');
  if (existing) {
    return existing;
  }
  const { agendaService } = buildGraphServices();
  agendaStore.set('default', agendaService);
  return agendaService;
};

const getMeetingTranscriptService = () => {
  const { onlineMeetingService, transcriptService } = buildGraphServices();
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
  englishText: string,
  nlu: NluResult | undefined,
  requireTranscript: boolean
): Promise<import('../src/agenda/types.js').AgendaItem | undefined> => {
  const fallbackRange = parseAgendaRange(englishText);
  const nluRange = resolveDateRangeFromNlu(nlu);
  const range = nluRange ?? { start: fallbackRange.start, end: fallbackRange.end };
  const subjectQuery = nlu?.subject ?? fallbackRange.remainder;
  const agendaService = getAgendaService();
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
  const fallbackRange = parseAgendaRange(englishText);
  const nluRange = resolveDateRangeFromNlu(nlu);
  const range = nluRange ?? { start: fallbackRange.start, end: fallbackRange.end };
  const subjectQuery = nlu?.subject ?? fallbackRange.remainder;
  const agendaService = getAgendaService();
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
  if (!agenda.items.length) {
    return {
      text: await translateOutgoing(t('agenda.none'), preferred)
    };
  }
  const filtered = agenda.items.filter((item) => item.transcriptAvailable);
  if (!filtered.length) {
    return {
      text: await translateOutgoing(t('transcript.notAvailable'), preferred)
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
        languageStore.set(request.conversationId, language);
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
        const store = selectionStore.get(request.conversationId);
        if (!store || !store.items.length) {
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
        const { onlineMeetingService, transcriptService } = getMeetingTranscriptService();
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
        const question = remainder || request.text;
        const englishQuestion = await translateToEnglish(question, preferred);
        const store = selectionStore.get(request.conversationId);
        if (!store || !store.items.length) {
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
        const { onlineMeetingService, transcriptService } = getMeetingTranscriptService();
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
    if (intent === 'contribute' || isContributeIntent(englishText)) {
      return {
        text: await translateOutgoing(
          t('contribute', { repoUrl: 'https://github.com/PlainConceptsGC/teams-meetinglens' }),
          preferred
        )
      };
    }

    if (intent === 'summary') {
      const store = selectionStore.get(request.conversationId);
      const selected = store?.items?.[0]?.agendaItem;
      const meeting = selected ?? (await findMeetingFromNlu(englishText, nlu, true));
      if (!meeting) {
        return { text: await translateOutgoing(t('meeting.notFound'), preferred) };
      }
      const { onlineMeetingService, transcriptService } = getMeetingTranscriptService();
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
      const question = nlu?.question ?? englishText;
      const store = selectionStore.get(request.conversationId);
      const selected = store?.items?.[0]?.agendaItem;
      const meeting = selected ?? (await findMeetingFromNlu(englishText, nlu, true));
      if (meeting) {
        const { onlineMeetingService, transcriptService } = getMeetingTranscriptService();
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
      const request: ChannelRequest = {
        channelId: activity.channelId ?? 'msteams',
        conversationId: activity.conversation?.id ?? '',
        messageId: activity.id ?? '',
        fromUserId: activity.from?.id ?? '',
        fromUserName: activity.from?.name ?? undefined,
        tenantId: activity.conversation?.tenantId ?? activity.channelData?.tenant?.id,
        text: commandText ?? activity.text ?? '',
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
        locale: activity.locale ?? undefined
      };

      const response = await router.handle(request);
      const metadata = response.metadata?.adaptiveCard;
      if (metadata) {
        await context.sendActivity({
          text: response.text,
          attachments: [JSON.parse(metadata)]
        });
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
