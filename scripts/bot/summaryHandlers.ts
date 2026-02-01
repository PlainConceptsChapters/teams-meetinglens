import crypto from 'node:crypto';
import { MeetingTranscriptService } from '../../src/agenda/meetingTranscriptService.js';
import type { AgendaItem } from '../../src/agenda/types.js';
import { QaService } from '../../src/llm/qnaService.js';
import { SummarizationService } from '../../src/llm/summarizationService.js';
import { renderSummaryTemplate } from '../../src/llm/summaryTemplate.js';
import type { ChannelRequest, ChannelResponse } from '../../src/teams/types.js';
import type { LanguageCode } from '../../src/teams/language.js';
import type { LlmClient } from '../../src/llm/types.js';
import type { TranscriptContent } from '../../src/types/transcript.js';
import { getSelectedItem, isSelectionExpired, selectionStore } from './stores.js';
import { answerWithLogging, summarizeWithLogging } from './llm.js';
import { findMeetingFromNlu, findMostRecentMeetingWithTranscript, getTranscriptFromMeetingContext } from './meeting.js';
import type { NluResult } from '../../src/teams/nluService.js';
import { formatAgendaItem } from './agenda.js';
import { logEvent } from './logging.js';
import { summaryOptions } from './config.js';

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
  selectionTtlMs: number;
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
    t,
    selectionTtlMs
  } = deps;

  const updateProgress = async (
    request: ChannelRequest,
    baseKey: string,
    stepKey: string,
    percent: number
  ) => {
    await request.progress?.update({
      label: `${t('progress.loading')} ${t(baseKey)} - ${t(stepKey)}`,
      percent
    });
  };

  const buildSelectionPrefix = (request: ChannelRequest): string => {
    const store = selectionStore.get(request.conversationId);
    const selected = getSelectedItem(store, Date.now(), selectionTtlMs);
    return selected ? `${t('selection.using', { title: selected.title })}\n` : '';
  };

  const buildQaResponse = async (
    request: ChannelRequest,
    preferred: LanguageCode,
    answer: string
  ): Promise<ChannelResponse> => {
    const text = `${buildSelectionPrefix(request)}${answer}\n${t('qa.followupHint')}`;
    return { text: await translateOutgoing(text, preferred) };
  };

  const buildQaError = async (preferred: LanguageCode): Promise<ChannelResponse> => {
    return { text: await translateOutgoing(t('qa.failed'), preferred) };
  };

  const buildSummaryResponse = async (
    request: ChannelRequest,
    preferred: LanguageCode,
    transcript: TranscriptContent,
    correlationId: string
  ): Promise<ChannelResponse> => {
    try {
      await updateProgress(request, 'progress.summary', 'progress.steps.chunking', 35);
      const client = buildSummaryLlmClient();
      const mergeClient = buildLlmClient();
      const summarizer = new SummarizationService({
        client,
        mergeClient,
        options: summaryOptions,
        onProgress: async (update) => {
          if (update.stage === 'chunk' && update.total) {
            const percent = 40 + Math.round((update.completed / update.total) * 40);
            await updateProgress(request, 'progress.summary', 'progress.steps.summarizing', percent);
          }
          if (update.stage === 'merge') {
            await updateProgress(request, 'progress.summary', 'progress.steps.merging', 85);
          }
        }
      });
      const result = await summarizeWithLogging(
        request,
        transcript,
        summarizer,
        { language: 'en' },
        correlationId,
        summaryOptions
      );
      await updateProgress(request, 'progress.summary', 'progress.steps.rendering', 92);
      const summaryText = renderSummaryTemplate(result, { language: preferred, format: 'plain' });
      const text = `${buildSelectionPrefix(request)}${summaryText}\n${t('summary.followupHint')}`;
      return {
        text
      };
    } catch {
      return { text: await translateOutgoing(`${t('summary.failed')}\n${t('summary.retryHint')}`, preferred) };
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
      selectedIndex: 1,
      selectedAt: Date.now()
    });
    logEvent(request, 'selection_set', {
      component: 'summary',
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
    await updateProgress(request, 'progress.summary', 'progress.steps.fetchTranscript', 20);
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
    if (isSelectionExpired(store, Date.now(), selectionTtlMs)) {
      if (store) {
        store.selectedIndex = undefined;
        store.selectedAt = undefined;
        selectionStore.set(request.conversationId, store);
      }
      return { text: await translateOutgoing(t('selection.expired'), preferred) };
    }
    if (store && !store.items.length) {
      selectionStore.delete(request.conversationId);
    }
    const selected = getSelectedItem(store, Date.now(), selectionTtlMs)?.agendaItem;
    if (!store || !store.items.length) {
      try {
        await updateProgress(request, 'progress.summary', 'progress.steps.fetchTranscript', 20);
        const transcript = await getTranscriptFromMeetingContext(request, getMeetingTranscriptService);
        if (transcript?.raw) {
          return buildSummaryResponse(request, preferred, transcript, correlationId);
        }
      } catch {
        return { text: await translateOutgoing(t('transcript.notAvailable'), preferred) };
      }
      await updateProgress(request, 'progress.summary', 'progress.steps.fetchTranscript', 30);
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
      await updateProgress(request, 'progress.summary', 'progress.steps.fetchTranscript', 20);
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
    const store = selectionStore.get(request.conversationId);
    if (isSelectionExpired(store, Date.now(), selectionTtlMs)) {
      if (store) {
        store.selectedIndex = undefined;
        store.selectedAt = undefined;
        selectionStore.set(request.conversationId, store);
      }
      return { text: await translateOutgoing(t('selection.expired'), preferred) };
    }
    if (nlu?.meetingRecency === 'last') {
      const response = await summarizeMostRecentMeeting(request, preferred, correlationId);
      if (response) {
        return response;
      }
    }
    const selected = getSelectedItem(store, Date.now(), selectionTtlMs)?.agendaItem;
    try {
      await updateProgress(request, 'progress.summary', 'progress.steps.fetchTranscript', 20);
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
      await updateProgress(request, 'progress.summary', 'progress.steps.fetchTranscript', 20);
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
    if (isSelectionExpired(store, Date.now(), selectionTtlMs)) {
      if (store) {
        store.selectedIndex = undefined;
        store.selectedAt = undefined;
        selectionStore.set(request.conversationId, store);
      }
      return { text: await translateOutgoing(t('selection.expired'), preferred) };
    }
    if (!store || !store.items.length) {
      try {
        await updateProgress(request, 'progress.qa', 'progress.steps.fetchTranscript', 25);
        const transcript = await getTranscriptFromMeetingContext(request, getMeetingTranscriptService);
        if (transcript?.raw) {
          const client = buildLlmClient();
          const qa = new QaService({ client });
          try {
            await updateProgress(request, 'progress.qa', 'progress.steps.answering', 70);
            const result = await answerWithLogging(request, englishQuestion, transcript, qa, { language: 'en' }, correlationId);
            await updateProgress(request, 'progress.qa', 'progress.steps.preparingResponse', 90);
            return buildQaResponse(request, preferred, result.answer);
          } catch {
            return buildQaError(preferred);
          }
        }
      } catch {
        return { text: await translateOutgoing(t('transcript.notAvailable'), preferred) };
      }
      await updateProgress(request, 'progress.qa', 'progress.steps.fetchTranscript', 35);
      const transcript = await buildTranscript();
      if (!transcript.raw) {
        return {
          text: await translateOutgoing(t('transcript.notConfigured'), preferred)
        };
      }
      const client = buildLlmClient();
      const qa = new QaService({ client });
      try {
        await updateProgress(request, 'progress.qa', 'progress.steps.answering', 70);
        const result = await answerWithLogging(request, englishQuestion, transcript, qa, { language: 'en' }, correlationId);
        await updateProgress(request, 'progress.qa', 'progress.steps.preparingResponse', 90);
        return buildQaResponse(request, preferred, result.answer);
      } catch {
        return buildQaError(preferred);
      }
    }
    const selected = getSelectedItem(store, Date.now(), selectionTtlMs)?.agendaItem;
    if (!selected) {
      return { text: await translateOutgoing(t('selection.needSelection'), preferred) };
    }
    const { onlineMeetingService, transcriptService } = getMeetingTranscriptService(request);
    let transcript;
    try {
      await updateProgress(request, 'progress.qa', 'progress.steps.fetchTranscript', 25);
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
    try {
      await updateProgress(request, 'progress.qa', 'progress.steps.answering', 70);
      const result = await answerWithLogging(request, englishQuestion, transcript, qa, { language: 'en' }, correlationId);
      await updateProgress(request, 'progress.qa', 'progress.steps.preparingResponse', 90);
      return buildQaResponse(request, preferred, result.answer);
    } catch {
      return buildQaError(preferred);
    }
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
    if (isSelectionExpired(store, Date.now(), selectionTtlMs)) {
      if (store) {
        store.selectedIndex = undefined;
        store.selectedAt = undefined;
        selectionStore.set(request.conversationId, store);
      }
      return { text: await translateOutgoing(t('selection.expired'), preferred) };
    }
    const selected = getSelectedItem(store, Date.now(), selectionTtlMs)?.agendaItem;
    try {
      await updateProgress(request, 'progress.qa', 'progress.steps.fetchTranscript', 25);
      const transcriptFromContext = await getTranscriptFromMeetingContext(request, getMeetingTranscriptService);
      if (transcriptFromContext?.raw) {
        const client = buildLlmClient();
        const qa = new QaService({ client });
        try {
          await updateProgress(request, 'progress.qa', 'progress.steps.answering', 70);
          const result = await answerWithLogging(request, question, transcriptFromContext, qa, { language: 'en' }, correlationId);
          await updateProgress(request, 'progress.qa', 'progress.steps.preparingResponse', 90);
          return buildQaResponse(request, preferred, result.answer);
        } catch {
          return buildQaError(preferred);
        }
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
        await updateProgress(request, 'progress.qa', 'progress.steps.fetchTranscript', 25);
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
      try {
        await updateProgress(request, 'progress.qa', 'progress.steps.answering', 70);
        const result = await answerWithLogging(request, question, transcript, qa, { language: 'en' }, correlationId);
        await updateProgress(request, 'progress.qa', 'progress.steps.preparingResponse', 90);
        return buildQaResponse(request, preferred, result.answer);
      } catch {
        return buildQaError(preferred);
      }
    }

    if (store?.items?.length && !store.selectedIndex) {
      return { text: await translateOutgoing(t('selection.needSelection'), preferred) };
    }

    const transcript = await buildTranscript();
    if (transcript.raw) {
      const client = buildLlmClient();
      const qa = new QaService({ client });
      try {
        await updateProgress(request, 'progress.qa', 'progress.steps.answering', 70);
        const result = await answerWithLogging(request, question, transcript, qa, { language: 'en' }, correlationId);
        await updateProgress(request, 'progress.qa', 'progress.steps.preparingResponse', 90);
        return buildQaResponse(request, preferred, result.answer);
      } catch {
        return buildQaError(preferred);
      }
    }

    return { text: await translateOutgoing(t('meeting.notFound'), preferred) };
  };

  return { handleSummaryCommand, handleSummaryIntent, handleQaCommand, handleQaIntent };
};
