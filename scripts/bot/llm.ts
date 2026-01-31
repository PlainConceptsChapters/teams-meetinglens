import { chunkText } from '../../src/llm/chunker.js';
import type { SummaryLanguage, SummarizationService } from '../../src/llm/summarizationService.js';
import type { QaService } from '../../src/llm/qnaService.js';
import type { ChannelRequest } from '../../src/teams/types.js';
import type { TranscriptContent } from '../../src/types/transcript.js';
import { logEvent } from './logging.js';

const SUMMARY_LOGGING_OPTIONS = {
  maxTokensPerChunk: 1500,
  overlapTokens: 150,
  maxChunks: 6
} as const;

const buildTranscriptTextForLogging = (content: TranscriptContent) => {
  if (!content.cues.length) {
    return content.raw;
  }
  return content.cues
    .map((cue) => {
      const speaker = cue.speaker ? `[${cue.speaker}] ` : '';
      return `${speaker}${cue.text}`.trim();
    })
    .join('\n');
};

export const summarizeWithLogging = async (
  request: ChannelRequest,
  transcript: TranscriptContent,
  summarizer: SummarizationService,
  options: { language: SummaryLanguage },
  correlationId: string
) => {
  const transcriptText = buildTranscriptTextForLogging(transcript);
  const chunks = chunkText(
    transcriptText,
    SUMMARY_LOGGING_OPTIONS.maxTokensPerChunk,
    SUMMARY_LOGGING_OPTIONS.overlapTokens
  ).slice(0, SUMMARY_LOGGING_OPTIONS.maxChunks);
  logEvent(request, 'summary_request', {
    component: 'llm',
    correlationId,
    transcriptLength: transcriptText.length,
    chunkCount: chunks.length,
    language: options.language
  });
  const started = Date.now();
  try {
    const result = await summarizer.summarize(transcript, options);
    logEvent(request, 'summary_complete', {
      component: 'llm',
      correlationId,
      latencyMs: Date.now() - started,
      chunkCount: chunks.length
    });
    return result;
  } catch (error) {
    logEvent(request, 'summary_error', {
      component: 'llm',
      level: 'error',
      correlationId,
      latencyMs: Date.now() - started,
      errorType: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
};

export const answerWithLogging = async (
  request: ChannelRequest,
  question: string,
  transcript: TranscriptContent,
  qa: QaService,
  options: { language: SummaryLanguage },
  correlationId: string
) => {
  logEvent(request, 'qa_request', {
    component: 'llm',
    correlationId,
    questionLength: question.length,
    language: options.language
  });
  const started = Date.now();
  try {
    const result = await qa.answerQuestion(question, transcript, options);
    logEvent(request, 'qa_complete', {
      component: 'llm',
      correlationId,
      latencyMs: Date.now() - started
    });
    return result;
  } catch (error) {
    logEvent(request, 'qa_error', {
      component: 'llm',
      level: 'error',
      correlationId,
      latencyMs: Date.now() - started,
      errorType: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
};
