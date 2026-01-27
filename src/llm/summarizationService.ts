import { InvalidRequestError, OutputValidationError } from '../errors/index.js';
import { TranscriptContent } from '../types/transcript.js';
import { chunkText } from './chunker.js';
import { redactSensitive } from './guardrails.js';
import { SUMMARY_SYSTEM_PROMPT, buildSummaryUserPrompt } from './promptTemplates.js';
import { parseSummaryResult, SummaryResult } from './schema.js';
import { LlmClient } from './types.js';

export interface SummarizationOptions {
  maxTokensPerChunk?: number;
  overlapTokens?: number;
  maxChunks?: number;
}

export interface SummarizationServiceOptions {
  client: LlmClient;
  options?: SummarizationOptions;
}

const buildTranscriptText = (content: TranscriptContent): string => {
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

const redactSummary = (result: SummaryResult): SummaryResult => {
  const summary = redactSensitive(result.summary).text;
  const keyPoints = result.keyPoints.map((item) => redactSensitive(item).text);
  const actionItems = result.actionItems.map((item) => redactSensitive(item).text);
  const decisions = result.decisions.map((item) => redactSensitive(item).text);
  const topics = result.topics.map((item) => redactSensitive(item).text);
  return { summary, keyPoints, actionItems, decisions, topics };
};

const mergePartialSummaries = (partials: SummaryResult[]): SummaryResult => {
  const summary = partials.map((item) => item.summary).join(' ');
  const keyPoints = partials.flatMap((item) => item.keyPoints);
  const actionItems = partials.flatMap((item) => item.actionItems);
  const decisions = partials.flatMap((item) => item.decisions);
  const topics = Array.from(new Set(partials.flatMap((item) => item.topics)));
  return { summary, keyPoints, actionItems, decisions, topics };
};

export class SummarizationService {
  private readonly client: LlmClient;
  private readonly options: Required<SummarizationOptions>;

  constructor(options: SummarizationServiceOptions) {
    this.client = options.client;
    this.options = {
      maxTokensPerChunk: options.options?.maxTokensPerChunk ?? 1500,
      overlapTokens: options.options?.overlapTokens ?? 150,
      maxChunks: options.options?.maxChunks ?? 6
    };
  }

  async summarize(content: TranscriptContent): Promise<SummaryResult> {
    if (!content.raw && content.cues.length === 0) {
      throw new InvalidRequestError('Transcript content is empty.');
    }

    const transcriptText = buildTranscriptText(content);
    const chunks = chunkText(transcriptText, this.options.maxTokensPerChunk, this.options.overlapTokens).slice(
      0,
      this.options.maxChunks
    );

    if (!chunks.length) {
      throw new InvalidRequestError('Unable to chunk transcript content.');
    }

    const partials: SummaryResult[] = [];
    for (const chunk of chunks) {
      const response = await this.client.complete([
        { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: buildSummaryUserPrompt(chunk.text) }
      ]);
      partials.push(parseSummaryResult(response));
    }

    const merged = partials.length === 1 ? partials[0] : mergePartialSummaries(partials);
    const redacted = redactSummary(merged);
    if (!redacted.summary.trim()) {
      throw new OutputValidationError('Summary output is empty after redaction.');
    }

    return redacted;
  }
}
