import crypto from 'node:crypto';
import { MeetingTranscriptService } from '../../src/agenda/meetingTranscriptService.js';
import type { AgendaItem } from '../../src/agenda/types.js';
import { QaService } from '../../src/llm/qnaService.js';
import { SummarizationService } from '../../src/llm/summarizationService.js';
import { buildSummaryAdaptiveCard } from '../../src/llm/summaryAdaptiveCard.js';
import type { ChannelRequest, ChannelResponse } from '../../src/teams/types.js';
import type { LanguageCode } from '../../src/teams/language.js';
import type { LlmClient } from '../../src/llm/types.js';
import type { TranscriptContent } from '../../src/types/transcript.js';
import { getSelectedItem, selectionStore } from './stores.js';
import { answerWithLogging, summarizeWithLogging } from './llm.js';
import { findMeetingFromNlu, findMostRecentMeetingWithTranscript, getTranscriptFromMeetingContext } from './meeting.js';
import type { NluResult } from '../../src/teams/nluService.js';
import { formatAgendaItem } from './agenda.js';
import { logEvent } from './logging.js';

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

  const buildSummaryResponse = async (
    request: ChannelRequest,
    preferred: LanguageCode,
    transcript: TranscriptContent,
    correlationId: string
  ): Promise<ChannelResponse> => {
    try {
      const client = buildSummaryLlmClient();
      const mergeClient = buildLlmClient();
      const summarizer = new SummarizationService({ client, mergeClient });
      const result = await summarizeWithLogging(request, transcript, summarizer, { language: 'en' }, correlationId);
      const card = buildSummaryAdaptiveCard(result, { language: 'en' });
      return {
        text: await translateOutgoing(t('summary.cardFallback'), preferred),
        metadata: { adaptiveCard: JSON.stringify(card) }
      };
    } catch {
      return { text: await translateOutgoing(t('summary.failed'), preferred) };
    }
  };

  const setSelectionFromMeeting = async (request: ChannelRequest, preferred: LanguageCode, meeting: AgendaItem) => {
    const display = formatAgendaItem(meeting, t);
    const title =
      display.title && display.title !== t('agenda.untitled')
        ? await translateOutgoing(display.title, preferred)
        : await translateOutgoing(t('agenda.untitled'), preferred);
    const details = display.details ? await translateOutgoing(display.details, preferred) : '';
    selectionStore.set(request.conversationId, {
      items: [
        {
          index: 1,
          title,
          details,
          agendaItem: meeting
        }
      ],
      selectedIndex: 1
    });
    logEvent(request, 'selection_set', {
      correlationId: request.correlationId,
      selectionIndex: 1,
      title
    });
  };

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
    await setSelectionFromMeeting(request, preferred, recent);
    return buildSummaryResponse(request, preferred, transcript, correlationId);
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
    const selected = getSelectedItem(store)?.agendaItem;
    if (!store || !store.items.length) {
      try {
        const transcript = await getTranscriptFromMeetingContext(request, getMeetingTranscriptService);
        if (transcript?.raw) {
          return buildSummaryResponse(request, preferred, transcript, correlationId);
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
      return buildSummaryResponse(request, preferred, transcript, correlationId);
    }

    if (!selected) {
      return { text: await translateOutgoing(t('selection.needSelection'), preferred) };
    }
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
    return buildSummaryResponse(request, preferred, transcript, correlationId);
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
    const selected = getSelectedItem(store)?.agendaItem;
    try {
      const transcriptFromContext = await getTranscriptFromMeetingContext(request, getMeetingTranscriptService);
      if (transcriptFromContext?.raw) {
        return buildSummaryResponse(request, preferred, transcriptFromContext, correlationId);
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
      if (store?.items?.length && !store.selectedIndex) {
        return { text: await translateOutgoing(t('selection.needSelection'), preferred) };
      }
      return { text: await translateOutgoing(t('meeting.notFound'), preferred) };
    }
    await setSelectionFromMeeting(request, preferred, meeting);
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
    return buildSummaryResponse(request, preferred, transcript, correlationId);
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
    const selected = getSelectedItem(store)?.agendaItem;
    if (!selected) {
      return { text: await translateOutgoing(t('selection.needSelection'), preferred) };
    }
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
    const selected = getSelectedItem(store)?.agendaItem;
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
      await setSelectionFromMeeting(request, preferred, meeting);
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

    if (store?.items?.length && !store.selectedIndex) {
      return { text: await translateOutgoing(t('selection.needSelection'), preferred) };
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
