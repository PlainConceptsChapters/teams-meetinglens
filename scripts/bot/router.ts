import { TeamsCommandRouter } from '../../src/teams/router.js';
import { extractLanguageToken, languageNames } from '../../src/teams/language.js';
import { NluService } from '../../src/teams/nluService.js';
import type { ChannelRequest, ChannelResponse } from '../../src/teams/types.js';
import type { LanguageCode } from '../../src/teams/language.js';
import type { NluResult } from '../../src/teams/nluService.js';
import type { LlmClient } from '../../src/llm/types.js';
import { BUILD_VERSION } from '../../src/version.js';
import { handleAgendaRequest, formatRangeLabel } from './agenda.js';
import { selectionStore, languageStore, getLanguageKey } from './stores.js';
import { createSummaryHandlers } from './summaryHandlers.js';
import {
  isAgendaIntent,
  isContributeIntent,
  isGraphDebugIntent,
  isHelpIntent,
  isHowIntent,
  isTodayIntent,
  isWhoamiIntent
} from './intent.js';
import { isLogEnabled, logEvent, setLogEnabled } from './logging.js';

export const createRouter = (deps: {
  botMentionText?: string;
  oauthConnection?: string;
  graphAccessToken?: string;
  systemTimeZone: string;
  t: (key: string, vars?: Record<string, string>) => string;
  translateOutgoing: (text: string, language: LanguageCode) => Promise<string>;
  translateToEnglish: (text: string, language: LanguageCode) => Promise<string>;
  resolvePreferredLanguage: (request: ChannelRequest, explicit?: LanguageCode) => Promise<LanguageCode>;
  buildHelpText: () => string;
  buildSignInCard: (prompt: string, cta: string, signInLink: string) => unknown;
  buildAgendaCard: (title: string, items: { index: number; title: string; details: string }[]) => unknown;
  buildTranscript: () => Promise<{ raw: string; cues: [] }>;
  buildGraphServicesForRequest: (request: ChannelRequest) => {
    agendaService: { searchAgenda: Function };
    onlineMeetingService: unknown;
    transcriptService: unknown;
  };
  getMeetingTranscriptService: (request: ChannelRequest) => { onlineMeetingService: unknown; transcriptService: unknown };
  runGraphDebug: (request: ChannelRequest) => Promise<
    | { ok: true; count?: number; start?: Date; end?: Date; withJoinUrl?: number; withTranscript?: number }
    | { ok: false; error?: string }
  >;
  buildLlmClient: () => LlmClient;
  buildSummaryLlmClient: () => LlmClient;
}) => {
  const {
    botMentionText,
    oauthConnection,
    graphAccessToken,
    systemTimeZone,
    t,
    translateOutgoing,
    translateToEnglish,
    resolvePreferredLanguage,
    buildHelpText,
    buildSignInCard,
    buildAgendaCard,
    buildTranscript,
    buildGraphServicesForRequest,
    getMeetingTranscriptService,
    runGraphDebug,
    buildLlmClient,
    buildSummaryLlmClient
  } = deps;

  const buildSignInResponse = async (request: ChannelRequest, language: LanguageCode): Promise<ChannelResponse> => {
    const text = await translateOutgoing(t('auth.signIn'), language);
    const metadata = request.signInLink
      ? {
          signinLink: request.signInLink,
          followupText: await translateOutgoing(t('auth.waitingForCode'), language)
        }
      : undefined;
    return { text, metadata };
  };

  let nluService: NluService | undefined;
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

  const findNlu = async (englishText: string, now: Date): Promise<NluResult | undefined> => {
    return getNluService()?.parse(englishText, now, systemTimeZone);
  };

  const summaryHandlers = createSummaryHandlers({
    graphAccessToken,
    buildSignInResponse,
    buildLlmClient,
    buildSummaryLlmClient,
    buildTranscript,
    getMeetingTranscriptService,
    buildGraphServicesForRequest,
    translateOutgoing,
    t
  });

  return new TeamsCommandRouter({
    botMentionText,
    routes: [
      {
        command: 'version',
        handler: async (request) => {
          const language = await resolvePreferredLanguage(request);
          return { text: await translateOutgoing(t('version.text', { version: BUILD_VERSION }), language) };
        }
      },
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
            setLogEnabled(request, true);
            return { text: await translateOutgoing(t('logs.enabled'), language) };
          }
          if (action === 'off') {
            setLogEnabled(request, false);
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
        command: 'select',
        handler: async (request) => {
          const store = selectionStore.get(request.conversationId);
          if (!store || !store.items.length) {
            const language = await resolvePreferredLanguage(request);
            return { text: await translateOutgoing(t('selection.needAgenda'), language) };
          }
          const rawText = request.text.trim();
          const selectionToken = rawText ? rawText.split(' ')[0] : '';
          const selectionFromValue =
            typeof request.value === 'object' && request.value && 'selection' in request.value
              ? String((request.value as { selection?: string }).selection ?? '')
              : '';
          const selection = selectionToken || selectionFromValue;
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
          return summaryHandlers.handleSummaryCommand(request, preferred);
        }
      },
      {
        command: 'qa',
        handler: async (request) => {
          const { language, remainder } = extractLanguageToken(request.text ?? '');
          const preferred = await resolvePreferredLanguage(request, language);
          const question = remainder || request.text;
          const englishQuestion = await translateToEnglish(question, preferred);
          return summaryHandlers.handleQaCommand(request, preferred, englishQuestion);
        }
      }
    ],
    defaultHandler: async (request) => {
      const { language } = extractLanguageToken(request.text ?? '');
      const preferred = await resolvePreferredLanguage(request, language);
      const englishText = await translateToEnglish(request.text ?? '', preferred);
      const nlu = await findNlu(englishText, new Date());
      const intent = nlu?.intent ?? 'unknown';
      logEvent(request, 'intent_resolved', {
        correlationId: request.correlationId,
        intent,
        hasNlu: Boolean(nlu),
        textLength: englishText.length
      });

      if (intent === 'agenda' || isAgendaIntent(englishText)) {
        return handleAgendaRequest({
          request,
          englishText,
          nlu,
          preferred,
          t,
          translateOutgoing,
          buildAgendaCard,
          selectionStore,
          buildGraphServicesForRequest,
          formatRangeLabel
        });
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
          setLogEnabled(request, true);
          return { text: await translateOutgoing(t('logs.enabled'), preferred) };
        }
        if (rest === 'off') {
          setLogEnabled(request, false);
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
        return summaryHandlers.handleSummaryIntent(request, preferred, englishText, nlu);
      }

      if (intent === 'qa') {
        return summaryHandlers.handleQaIntent(request, preferred, englishText, nlu);
      }

      return { text: await translateOutgoing(t('fallback.unknown'), preferred) };
    }
  });
};
