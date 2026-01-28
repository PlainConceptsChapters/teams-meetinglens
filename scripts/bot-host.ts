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
import { LanguageCode, extractLanguageToken, languageNames, resolveLanguage } from '../src/teams/language.js';
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


type TranslationCatalog = Record<string, unknown>;
const languageStore = new Map<string, SupportedLanguage>();
const agendaStore = new Map<string, AgendaService>();
const selectionStore = new Map<
  string,
  { items: { index: number; title: string; details: string; agendaItem: import('../src/agenda/types.js').AgendaItem }[] }
>();

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

const buildAgendaCard = (
  language: SupportedLanguage,
  items: { index: number; title: string; details: string }[]
) => {
  return {
    contentType: 'application/vnd.microsoft.card.adaptive',
    content: {
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        {
          type: 'TextBlock',
          text: t(language, 'agenda.title'),
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

const loadTranslations = async (): Promise<Record<SupportedLanguage, TranslationCatalog>> => {
  const root = path.resolve(process.cwd(), 'src', 'i18n');
  const [enRaw, esRaw, roRaw] = await Promise.all([
    fs.readFile(path.join(root, 'en.json'), 'utf8'),
    fs.readFile(path.join(root, 'es.json'), 'utf8'),
    fs.readFile(path.join(root, 'ro.json'), 'utf8')
  ]);
  return {
    en: JSON.parse(enRaw) as TranslationCatalog,
    es: JSON.parse(esRaw) as TranslationCatalog,
    ro: JSON.parse(roRaw) as TranslationCatalog
  };
};

const translations = await loadTranslations();

const t = (language: SupportedLanguage, keyPath: string, vars?: Record<string, string>): string => {
  const source = translations[language] ?? translations.en;
  const value = keyPath.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, source);
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

const buildHelpText = (language: SupportedLanguage): string => {
  return [
    t(language, 'help.title'),
    t(language, 'help.overview'),
    '',
    t(language, 'help.commandsTitle'),
    t(language, 'help.agenda'),
    t(language, 'help.select'),
    t(language, 'help.summary'),
    t(language, 'help.qa'),
    t(language, 'help.language'),
    t(language, 'help.how'),
    t(language, 'help.contribute'),
    t(language, 'help.help'),
    '',
    t(language, 'help.examplesTitle'),
    t(language, 'help.examples')
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

const formatAgendaItem = (language: SupportedLanguage, item: import('../src/agenda/types.js').AgendaItem) => {
  const subject = item.subject ?? t(language, 'agenda.untitled');
  const start = item.start ? new Date(item.start).toLocaleString() : t(language, 'agenda.unknownTime');
  const end = item.end ? new Date(item.end).toLocaleString() : '';
  const transcript = item.transcriptAvailable ? t(language, 'agenda.transcriptAvailable') : t(language, 'agenda.noTranscript');
  const organizer = item.organizerEmail ? t(language, 'agenda.organizer', { organizer: item.organizerEmail }) : '';
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

const inferLanguageFromText = (text: string): SupportedLanguage | undefined => {
  const lower = text.toLowerCase();
  if (
    lower.includes('ayuda') ||
    lower.includes('agenda') ||
    lower.includes('reuniones') ||
    lower.includes('resumen') ||
    lower.includes('pregunta') ||
    lower.includes('como')
  ) {
    return 'es';
  }
  if (
    lower.includes('ajutor') ||
    lower.includes('agenda mea') ||
    lower.includes('intalniri') ||
    lower.includes('rezumat') ||
    lower.includes('intrebare') ||
    lower.includes('cum')
  ) {
    return 'ro';
  }
  if (lower.includes('help') || lower.includes('agenda') || lower.includes('summary') || lower.includes('question')) {
    return 'en';
  }
  return undefined;
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
  const preferred = resolveLanguage(request, language, languageStore);
  const range = parseAgendaRange(remainder);
  const agendaService = getAgendaService();
  let agenda;
  try {
    agenda = await agendaService.searchAgenda({
      ...formatDateRange(range),
      subjectContains: range.remainder || undefined,
      includeTranscriptAvailability: true,
      top: 10
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Agenda search failed.';
    return {
      text: t(preferred, 'agenda.cannotAccess', { message })
    };
  }
  if (!agenda.items.length) {
    return {
      text: t(preferred, 'agenda.none')
    };
  }
  const filtered = agenda.items.filter((item) => item.transcriptAvailable);
  if (!filtered.length) {
    return {
      text: t(preferred, 'transcript.notAvailable')
    };
  }
  const formatted = filtered.map((item, index) => {
    const display = formatAgendaItem(preferred, item);
    return { index: index + 1, title: display.title, details: display.details, agendaItem: item };
  });
  selectionStore.set(request.conversationId, { items: formatted });
  return {
    text: t(preferred, 'agenda.intro'),
    metadata: { adaptiveCard: JSON.stringify(buildAgendaCard(preferred, formatted)) }
  };
};

const router = new TeamsCommandRouter({
  botMentionText,
  routes: [
    {
      command: 'help',
      handler: async (request) => {
        const language = resolveLanguage(request, undefined, languageStore);
        return { text: buildHelpText(language) };
      }
    },
    {
      command: 'how',
      handler: async (request) => {
        const language = resolveLanguage(request, undefined, languageStore);
        return { text: t(language, 'howItWorks') };
      }
    },
    {
      command: 'contribute',
      handler: async (request) => {
        const language = resolveLanguage(request, undefined, languageStore);
        return { text: t(language, 'contribute', { repoUrl: 'https://github.com/PlainConceptsGC/teams-meetinglens' }) };
      }
    },
    {
      command: 'language',
      handler: async (request) => {
        const { language } = extractLanguageToken(request.text ?? '');
        if (!language) {
          return { text: t('en', 'languagePrompt') };
        }
        languageStore.set(request.conversationId, language);
        return { text: t(language, 'languageSet', { languageName: languageNames[language] }) };
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
          const language = resolveLanguage(request, undefined, languageStore);
          return { text: t(language, 'selection.needAgenda') };
        }
        const index = Number(selection);
        if (!Number.isFinite(index) || index < 1 || index > store.items.length) {
          const language = resolveLanguage(request, undefined, languageStore);
          return { text: t(language, 'selection.invalid') };
        }
        const selected = store.items[index - 1];
        selectionStore.set(request.conversationId, { items: [selected] });
        const language = resolveLanguage(request, undefined, languageStore);
        return { text: t(language, 'selection.selected', { title: selected.title }) };
      }
    },
    {
      command: 'summary',
      handler: async (request) => {
        const { language } = extractLanguageToken(request.text ?? '');
        const preferred = resolveLanguage(request, language, languageStore);
        const store = selectionStore.get(request.conversationId);
        if (!store || !store.items.length) {
          const transcript = await buildTranscript();
          if (!transcript.raw) {
            return {
              text: t(preferred, 'transcript.notConfigured')
            };
          }
          const client = buildLlmClient();
          const summarizer = new SummarizationService({ client });
          const result = await summarizer.summarize(transcript, { language: preferred });
          return { text: result.summary };
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
            text: t(preferred, 'transcript.notAvailable')
          };
        }
        const client = buildLlmClient();
        const summarizer = new SummarizationService({ client });
        const result = await summarizer.summarize(transcript, { language: preferred });
        return { text: result.summary };
      }
    },
    {
      command: 'qa',
      handler: async (request) => {
        const { language, remainder } = extractLanguageToken(request.text ?? '');
        const preferred = resolveLanguage(request, language, languageStore);
        const store = selectionStore.get(request.conversationId);
        if (!store || !store.items.length) {
          const transcript = await buildTranscript();
          if (!transcript.raw) {
            return {
              text: t(preferred, 'transcript.notConfigured')
            };
          }
          const client = buildLlmClient();
          const qa = new QaService({ client });
          const result = await qa.answerQuestion(remainder || request.text, transcript, { language: preferred });
          return { text: result.answer };
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
            text: t(preferred, 'transcript.notAvailable')
          };
        }
        const client = buildLlmClient();
        const qa = new QaService({ client });
        const result = await qa.answerQuestion(remainder || request.text, transcript, { language: preferred });
        return { text: result.answer };
      }
    }
  ],
  defaultHandler: async (request) => {
    if (isAgendaIntent(request.text ?? '')) {
      return handleAgendaRequest(request);
    }
    if (isHowIntent(request.text ?? '')) {
      const language = resolveLanguage(request, inferLanguageFromText(request.text ?? ''), languageStore);
      return { text: t(language, 'howItWorks') };
    }
    if (isHelpIntent(request.text ?? '')) {
      const language = resolveLanguage(request, inferLanguageFromText(request.text ?? ''), languageStore);
      return { text: buildHelpText(language) };
    }
    if (isContributeIntent(request.text ?? '')) {
      const language = resolveLanguage(request, inferLanguageFromText(request.text ?? ''), languageStore);
      return { text: t(language, 'contribute', { repoUrl: 'https://github.com/PlainConceptsGC/teams-meetinglens' }) };
    }
    const { language } = extractLanguageToken(request.text ?? '');
    const preferred = resolveLanguage(request, language, languageStore);
    const transcript = await buildTranscript();
    if (!transcript.raw) {
      return {
        text: t(preferred, 'transcript.notConfigured')
      };
    }
    const client = buildLlmClient();
    const qa = new QaService({ client });
    const result = await qa.answerQuestion(request.text, transcript, { language: preferred });
    return { text: result.answer };
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
