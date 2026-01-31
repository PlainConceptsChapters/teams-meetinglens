import crypto from 'node:crypto';
import { MeetingTranscriptService } from '../../src/agenda/meetingTranscriptService.js';
import { QaService } from '../../src/llm/qnaService.js';
import { SummarizationService } from '../../src/llm/summarizationService.js';
import { buildSummaryAdaptiveCard } from '../../src/llm/summaryAdaptiveCard.js';
import type { ChannelRequest, ChannelResponse } from '../../src/teams/types.js';
import type { LanguageCode } from '../../src/teams/language.js';
import type { LlmClient } from '../../src/llm/types.js';
import { selectionStore } from './stores.js';
import { answerWithLogging, summarizeWithLogging } from './llm.js';
import { findMeetingFromNlu, findMostRecentMeetingWithTranscript, getTranscriptFromMeetingContext } from './meeting.js';
import type { NluResult } from '../../src/teams/nluService.js';

export const createSummaryHandlers = (deps: {
  graphAccessToken?: string;
  buildSignInResponse: (request: ChannelRequest, language: LanguageCode) => Promise<ChannelResponse>;
  buildLlmClient: () => LlmClient;
  buildSummaryLlmClient: () => LlmClient;
  buildTranscript: () => Promise<{ raw: string; cues: [] }>;
  getMeetingTranscriptService: (request: ChannelRequest) => { onlineMeetingService: unknown; transcriptService: unknown };
  buildGraphServicesForRequest: (request: ChannelRequest) => { agendaService: { searchAgenda: Function } };
  translateOutgoing: (text: string, language: LanguageCode) => Promise<string>;
  t: (key: string, vars?: Record<string, string>) => string;
}) => {
  const {
    graphAccessToken,
    buildSignInResponse,
    buildLlmClient,
    buildSummaryLlmClient,
    buildTranscript,
    getMeetingTranscriptService,
    buildGraphServicesForRequest,
    translateOutgoing,
    t
  } = deps;

  const summarizeMostRecentMeeting = async (
    request: ChannelRequest,
    preferred: LanguageCode,
    correlationId: string
  ): Promise<ChannelResponse | undefined> => {
    const recent = await findMostRecentMeetingWithTranscript({
      request,
      buildGraphServicesForRequest
    });
    if (!recent) {
      return undefined;
    }
    const { onlineMeetingService, transcriptService } = getMeetingTranscriptService(request);
    const transcriptLookup = new MeetingTranscriptService({
      onlineMeetingService: onlineMeetingService as any,
      transcriptService: transcriptService as any
    });
    const transcript = await transcriptLookup.getTranscriptForAgendaItem(recent);
    const client = buildSummaryLlmClient();
    const mergeClient = buildLlmClient();
    const summarizer = new SummarizationService({ client, mergeClient });
    const result = await summarizeWithLogging(request, transcript, summarizer, { language: 'en' }, correlationId);
    const card = buildSummaryAdaptiveCard(result, { language: 'en' });
    return {
      text: await translateOutgoing(t('summary.cardFallback'), preferred),
      metadata: { adaptiveCard: JSON.stringify(card) }
    };
  };

  const handleSummaryCommand = async (request: ChannelRequest, preferred: LanguageCode): Promise<ChannelResponse> => {
    const correlationId = request.correlationId ?? crypto.randomUUID();
    if (!request.graphToken && !graphAccessToken) {
      return buildSignInResponse(request, preferred);
    }
    const store = selectionStore.get(request.conversationId);
    if (store && !store.items.length) {
      selectionStore.delete(request.conversationId);
    }
    if (!store || !store.items.length) {
      try {
        const transcript = await getTranscriptFromMeetingContext(request, getMeetingTranscriptService);
        if (transcript?.raw) {
          const client = buildSummaryLlmClient();
          const mergeClient = buildLlmClient();
          const summarizer = new SummarizationService({ client, mergeClient });
          const result = await summarizeWithLogging(request, transcript, summarizer, { language: 'en' }, correlationId);
          const card = buildSummaryAdaptiveCard(result, { language: 'en' });
          return {
            text: await translateOutgoing(t('summary.cardFallback'), preferred),
            metadata: { adaptiveCard: JSON.stringify(card) }
          };
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
      const client = buildSummaryLlmClient();
      const mergeClient = buildLlmClient();
      const summarizer = new SummarizationService({ client, mergeClient });
      const result = await summarizeWithLogging(request, transcript, summarizer, { language: 'en' }, correlationId);
      const card = buildSummaryAdaptiveCard(result, { language: 'en' });
      return {
        text: await translateOutgoing(t('summary.cardFallback'), preferred),
        metadata: { adaptiveCard: JSON.stringify(card) }
      };
    }

    const selected = store.items[0].agendaItem;
    const { onlineMeetingService, transcriptService } = getMeetingTranscriptService(request);
    let transcript;
    try {
      const transcriptLookup = new MeetingTranscriptService({
        onlineMeetingService: onlineMeetingService as any,
        transcriptService: transcriptService as any
      });
      transcript = await transcriptLookup.getTranscriptForAgendaItem(selected);
    } catch {
      return {
        text: await translateOutgoing(t('transcript.notAvailable'), preferred)
      };
    }
    const client = buildSummaryLlmClient();
    const mergeClient = buildLlmClient();
    const summarizer = new SummarizationService({ client, mergeClient });
    const result = await summarizeWithLogging(request, transcript, summarizer, { language: 'en' }, correlationId);
    const card = buildSummaryAdaptiveCard(result, { language: 'en' });
    return {
      text: await translateOutgoing(t('summary.cardFallback'), preferred),
      metadata: { adaptiveCard: JSON.stringify(card) }
    };
  };

  const handleSummaryIntent = async (
    request: ChannelRequest,
    preferred: LanguageCode,
    englishText: string,
    nlu?: NluResult
  ): Promise<ChannelResponse> => {
    const correlationId = request.correlationId ?? crypto.randomUUID();
    if (!request.graphToken && !graphAccessToken) {
      return buildSignInResponse(request, preferred);
    }
    if (nlu?.meetingRecency === 'last') {
      const response = await summarizeMostRecentMeeting(request, preferred, correlationId);
      if (response) {
        return response;
      }
    }
    const store = selectionStore.get(request.conversationId);
    const selected = store?.items?.[0]?.agendaItem;
    try {
      const transcriptFromContext = await getTranscriptFromMeetingContext(request, getMeetingTranscriptService);
      if (transcriptFromContext?.raw) {
        const client = buildSummaryLlmClient();
        const mergeClient = buildLlmClient();
        const summarizer = new SummarizationService({ client, mergeClient });
        const result = await summarizeWithLogging(request, transcriptFromContext, summarizer, { language: 'en' }, correlationId);
        const card = buildSummaryAdaptiveCard(result, { language: 'en' });
        return {
          text: await translateOutgoing(t('summary.cardFallback'), preferred),
          metadata: { adaptiveCard: JSON.stringify(card) }
        };
      }
    } catch {
      return { text: await translateOutgoing(t('transcript.notAvailable'), preferred) };
    }

    const meeting = selected ?? (await findMeetingFromNlu({
      request,
      englishText,
      nlu,
      requireTranscript: true,
      buildGraphServicesForRequest
    }));
    if (!meeting) {
      return { text: await translateOutgoing(t('meeting.notFound'), preferred) };
    }
    const { onlineMeetingService, transcriptService } = getMeetingTranscriptService(request);
    let transcript;
    try {
      const transcriptLookup = new MeetingTranscriptService({
        onlineMeetingService: onlineMeetingService as any,
        transcriptService: transcriptService as any
      });
      transcript = await transcriptLookup.getTranscriptForAgendaItem(meeting);
    } catch {
      return { text: await translateOutgoing(t('transcript.notAvailable'), preferred) };
    }
    const client = buildSummaryLlmClient();
    const mergeClient = buildLlmClient();
    const summarizer = new SummarizationService({ client, mergeClient });
    const result = await summarizeWithLogging(request, transcript, summarizer, { language: 'en' }, correlationId);
    const card = buildSummaryAdaptiveCard(result, { language: 'en' });
    return {
      text: await translateOutgoing(t('summary.cardFallback'), preferred),
      metadata: { adaptiveCard: JSON.stringify(card) }
    };
  };

  const handleQaCommand = async (request: ChannelRequest, preferred: LanguageCode, englishQuestion: string): Promise<ChannelResponse> => {
    const correlationId = request.correlationId ?? crypto.randomUUID();
    if (!request.graphToken && !graphAccessToken) {
      return buildSignInResponse(request, preferred);
    }
    const store = selectionStore.get(request.conversationId);
    if (!store || !store.items.length) {
      try {
        const transcript = await getTranscriptFromMeetingContext(request, getMeetingTranscriptService);
        if (transcript?.raw) {
          const client = buildLlmClient();
          const qa = new QaService({ client });
          const result = await answerWithLogging(request, englishQuestion, transcript, qa, { language: 'en' }, correlationId);
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
      const result = await answerWithLogging(request, englishQuestion, transcript, qa, { language: 'en' }, correlationId);
      return { text: await translateOutgoing(result.answer, preferred) };
    }
    const selected = store.items[0].agendaItem;
    const { onlineMeetingService, transcriptService } = getMeetingTranscriptService(request);
    let transcript;
    try {
      const transcriptLookup = new MeetingTranscriptService({
        onlineMeetingService: onlineMeetingService as any,
        transcriptService: transcriptService as any
      });
      transcript = await transcriptLookup.getTranscriptForAgendaItem(selected);
    } catch {
      return {
        text: await translateOutgoing(t('transcript.notAvailable'), preferred)
      };
    }
    const client = buildLlmClient();
    const qa = new QaService({ client });
    const result = await answerWithLogging(request, englishQuestion, transcript, qa, { language: 'en' }, correlationId);
    return { text: await translateOutgoing(result.answer, preferred) };
  };

  const handleQaIntent = async (
    request: ChannelRequest,
    preferred: LanguageCode,
    englishText: string,
    nlu?: NluResult
  ): Promise<ChannelResponse> => {
    const correlationId = request.correlationId ?? crypto.randomUUID();
    if (!request.graphToken && !graphAccessToken) {
      return buildSignInResponse(request, preferred);
    }
    const question = nlu?.question ?? englishText;
    const store = selectionStore.get(request.conversationId);
    const selected = store?.items?.[0]?.agendaItem;
    try {
      const transcriptFromContext = await getTranscriptFromMeetingContext(request, getMeetingTranscriptService);
      if (transcriptFromContext?.raw) {
        const client = buildLlmClient();
        const qa = new QaService({ client });
        const result = await answerWithLogging(request, question, transcriptFromContext, qa, { language: 'en' }, correlationId);
        return { text: await translateOutgoing(result.answer, preferred) };
      }
    } catch {
      return { text: await translateOutgoing(t('transcript.notAvailable'), preferred) };
    }

    const meeting = selected ?? (await findMeetingFromNlu({
      request,
      englishText,
      nlu,
      requireTranscript: true,
      buildGraphServicesForRequest
    }));
    if (meeting) {
      const { onlineMeetingService, transcriptService } = getMeetingTranscriptService(request);
      let transcript;
      try {
        const transcriptLookup = new MeetingTranscriptService({
          onlineMeetingService: onlineMeetingService as any,
          transcriptService: transcriptService as any
        });
        transcript = await transcriptLookup.getTranscriptForAgendaItem(meeting);
      } catch {
        return { text: await translateOutgoing(t('transcript.notAvailable'), preferred) };
      }
      const client = buildLlmClient();
      const qa = new QaService({ client });
      const result = await answerWithLogging(request, question, transcript, qa, { language: 'en' }, correlationId);
      return { text: await translateOutgoing(result.answer, preferred) };
    }

    const transcript = await buildTranscript();
    if (transcript.raw) {
      const client = buildLlmClient();
      const qa = new QaService({ client });
      const result = await answerWithLogging(request, question, transcript, qa, { language: 'en' }, correlationId);
      return { text: await translateOutgoing(result.answer, preferred) };
    }

    return { text: await translateOutgoing(t('meeting.notFound'), preferred) };
  };

  return { handleSummaryCommand, handleSummaryIntent, handleQaCommand, handleQaIntent };
};
