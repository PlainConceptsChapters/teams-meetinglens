import { InvalidRequestError, NotFoundError, OutputValidationError } from '../errors/index.js';
import { TranscriptContent, TranscriptCue } from '../types/transcript.js';
import { containsDisallowedAnswer, redactSensitive } from './guardrails.js';
import { buildQaSystemPrompt, buildQaUserPrompt } from './promptTemplates.js';
import { parseQaResult, QaResult } from './schema.js';
import { LlmClient } from './types.js';

export interface QaServiceOptions {
  client: LlmClient;
  maxCues?: number;
}

export type QaLanguage = 'en' | 'es' | 'ro';

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/\W+/)
    .filter(Boolean);

const scoreCue = (cue: TranscriptCue, questionTokens: string[]): number => {
  if (!cue.text) {
    return 0;
  }
  const tokens = new Set(tokenize(cue.text));
  let score = 0;
  for (const token of questionTokens) {
    if (tokens.has(token)) {
      score += 1;
    }
  }
  return score;
};

const selectRelevantCues = (cues: TranscriptCue[], question: string, maxCues: number): TranscriptCue[] => {
  const questionTokens = tokenize(question);
  if (!questionTokens.length) {
    return [];
  }
  return cues
    .map((cue) => ({ cue, score: scoreCue(cue, questionTokens) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCues)
    .map((item) => item.cue);
};

const buildContext = (cues: TranscriptCue[]): string => {
  return cues
    .map((cue) => {
      const speaker = cue.speaker ? `${cue.speaker}: ` : '';
      return `[${cue.start} - ${cue.end}] ${speaker}${cue.text}`.trim();
    })
    .join('\n');
};

const redactQa = (result: QaResult): QaResult => {
  return {
    answer: redactSensitive(result.answer).text,
    citations: result.citations.map((item) => redactSensitive(item).text)
  };
};

export class QaService {
  private readonly client: LlmClient;
  private readonly maxCues: number;

  constructor(options: QaServiceOptions) {
    this.client = options.client;
    this.maxCues = options.maxCues ?? 6;
  }

  async answerQuestion(question: string, content: TranscriptContent, options?: { language?: QaLanguage }): Promise<QaResult> {
    if (!question.trim()) {
      throw new InvalidRequestError('Question is required.');
    }
    if (!content.raw && content.cues.length === 0) {
      throw new NotFoundError('Transcript content is empty.');
    }

    const cues = content.cues.length ? content.cues : [{ start: '', end: '', text: content.raw }];
    const selected = selectRelevantCues(cues, question, this.maxCues);
    if (!selected.length) {
      throw new NotFoundError('No relevant transcript context found.');
    }

    const context = buildContext(selected);
    const response = await this.client.complete([
      { role: 'system', content: buildQaSystemPrompt(options?.language) },
      { role: 'user', content: buildQaUserPrompt(question, context) }
    ]);

    const parsed = parseQaResult(response);
    const redacted = redactQa(parsed);
    if (!redacted.answer.trim()) {
      throw new OutputValidationError('Q&A answer is empty after redaction.');
    }
    if (containsDisallowedAnswer(redacted.answer)) {
      throw new OutputValidationError('Q&A answer contains disallowed content.');
    }

    return redacted;
  }
}
