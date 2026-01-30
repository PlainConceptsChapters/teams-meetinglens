import { InvalidRequestError, OutputValidationError } from '../errors/index.js';
import { TranscriptContent } from '../types/transcript.js';
import { chunkText } from './chunker.js';
import { redactSensitive } from './guardrails.js';
import { buildSummarySystemPrompt, buildSummaryUserPrompt } from './promptTemplates.js';
import { parseSummaryResult, SummaryResult, SummaryTemplateData, SummaryTopic } from './schema.js';
import { LlmClient } from './types.js';
import { renderSummaryTemplate } from './summaryTemplate.js';

export interface SummarizationOptions {
  maxTokensPerChunk?: number;
  overlapTokens?: number;
  maxChunks?: number;
}

export type SummaryLanguage = 'en' | 'es' | 'ro';

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

const redactTopics = (topics: SummaryTopic[]): SummaryTopic[] => {
  return topics.map((topic) => ({
    topic: redactSensitive(topic.topic).text,
    issueDescription: redactSensitive(topic.issueDescription).text,
    observations: topic.observations.map((item) => redactSensitive(item).text),
    rootCause: redactSensitive(topic.rootCause).text,
    impact: redactSensitive(topic.impact).text
  }));
};

const redactTemplateData = (data?: SummaryTemplateData): SummaryTemplateData | undefined => {
  if (!data) {
    return undefined;
  }
  return {
    meetingHeader: {
      meetingTitle: redactSensitive(data.meetingHeader.meetingTitle).text,
      companiesParties: redactSensitive(data.meetingHeader.companiesParties).text,
      date: redactSensitive(data.meetingHeader.date).text,
      duration: redactSensitive(data.meetingHeader.duration).text,
      linkReference: redactSensitive(data.meetingHeader.linkReference).text
    },
    actionItemsDetailed: data.actionItemsDetailed.map((item) => ({
      action: redactSensitive(item.action).text,
      owner: redactSensitive(item.owner).text,
      dueDate: redactSensitive(item.dueDate).text,
      notes: redactSensitive(item.notes).text
    })),
    meetingPurpose: redactSensitive(data.meetingPurpose).text,
    keyPointsDetailed: data.keyPointsDetailed.map((item) => ({
      title: redactSensitive(item.title).text,
      explanation: redactSensitive(item.explanation).text
    })),
    topicsDetailed: redactTopics(data.topicsDetailed),
    pathForward: {
      definitionOfSuccess: redactSensitive(data.pathForward.definitionOfSuccess).text,
      agreedNextAttempt: redactSensitive(data.pathForward.agreedNextAttempt).text,
      decisionPoint: redactSensitive(data.pathForward.decisionPoint).text,
      checkpointDate: redactSensitive(data.pathForward.checkpointDate).text
    },
    nextSteps: {
      partyA: {
        name: redactSensitive(data.nextSteps.partyA.name).text,
        steps: data.nextSteps.partyA.steps.map((step) => redactSensitive(step).text)
      },
      partyB: {
        name: redactSensitive(data.nextSteps.partyB.name).text,
        steps: data.nextSteps.partyB.steps.map((step) => redactSensitive(step).text)
      }
    }
  };
};

const redactSummary = (result: SummaryResult): SummaryResult => {
  const summary = redactSensitive(result.summary).text;
  const keyPoints = result.keyPoints.map((item) => redactSensitive(item).text);
  const actionItems = result.actionItems.map((item) => redactSensitive(item).text);
  const decisions = result.decisions.map((item) => redactSensitive(item).text);
  const topics = result.topics.map((item) => redactSensitive(item).text);
  const templateData = redactTemplateData(result.templateData);
  return { summary, keyPoints, actionItems, decisions, topics, templateData };
};

const firstNonEmpty = (value: string, fallback: string): string => {
  return value.trim() ? value : fallback;
};

const mergeTemplateData = (partials: SummaryTemplateData[]): SummaryTemplateData | undefined => {
  if (!partials.length) {
    return undefined;
  }
  const meetingHeader = partials.reduce(
    (acc, current) => ({
      meetingTitle: firstNonEmpty(acc.meetingTitle, current.meetingHeader.meetingTitle),
      companiesParties: firstNonEmpty(acc.companiesParties, current.meetingHeader.companiesParties),
      date: firstNonEmpty(acc.date, current.meetingHeader.date),
      duration: firstNonEmpty(acc.duration, current.meetingHeader.duration),
      linkReference: firstNonEmpty(acc.linkReference, current.meetingHeader.linkReference)
    }),
    { meetingTitle: '', companiesParties: '', date: '', duration: '', linkReference: '' }
  );

  const actionItemsDetailed = partials.flatMap((item) => item.actionItemsDetailed);
  const keyPointsDetailed = partials.flatMap((item) => item.keyPointsDetailed);

  const topicsByName = new Map<string, SummaryTopic>();
  for (const partial of partials) {
    for (const topic of partial.topicsDetailed) {
      const key = topic.topic.trim();
      if (!key) {
        topicsByName.set(`__empty_${topicsByName.size}`, topic);
        continue;
      }
      const existing = topicsByName.get(key);
      if (!existing) {
        topicsByName.set(key, topic);
        continue;
      }
      topicsByName.set(key, {
        topic: existing.topic,
        issueDescription: firstNonEmpty(existing.issueDescription, topic.issueDescription),
        observations: [...existing.observations, ...topic.observations],
        rootCause: firstNonEmpty(existing.rootCause, topic.rootCause),
        impact: firstNonEmpty(existing.impact, topic.impact)
      });
    }
  }

  const meetingPurpose = partials.reduce((acc, current) => firstNonEmpty(acc, current.meetingPurpose), '');

  const pathForward = partials.reduce(
    (acc, current) => ({
      definitionOfSuccess: firstNonEmpty(acc.definitionOfSuccess, current.pathForward.definitionOfSuccess),
      agreedNextAttempt: firstNonEmpty(acc.agreedNextAttempt, current.pathForward.agreedNextAttempt),
      decisionPoint: firstNonEmpty(acc.decisionPoint, current.pathForward.decisionPoint),
      checkpointDate: firstNonEmpty(acc.checkpointDate, current.pathForward.checkpointDate)
    }),
    { definitionOfSuccess: '', agreedNextAttempt: '', decisionPoint: '', checkpointDate: '' }
  );

  const partyAName = partials.reduce((acc, current) => firstNonEmpty(acc, current.nextSteps.partyA.name), '');
  const partyBName = partials.reduce((acc, current) => firstNonEmpty(acc, current.nextSteps.partyB.name), '');
  const partyASteps = partials.flatMap((item) => item.nextSteps.partyA.steps);
  const partyBSteps = partials.flatMap((item) => item.nextSteps.partyB.steps);

  return {
    meetingHeader,
    actionItemsDetailed,
    meetingPurpose,
    keyPointsDetailed,
    topicsDetailed: Array.from(topicsByName.values()),
    pathForward,
    nextSteps: {
      partyA: { name: partyAName, steps: partyASteps },
      partyB: { name: partyBName, steps: partyBSteps }
    }
  };
};

const mergePartialSummaries = (partials: SummaryResult[]): SummaryResult => {
  const summary = partials.map((item) => item.summary).join(' ');
  const keyPoints = partials.flatMap((item) => item.keyPoints);
  const actionItems = partials.flatMap((item) => item.actionItems);
  const decisions = partials.flatMap((item) => item.decisions);
  const topics = Array.from(new Set(partials.flatMap((item) => item.topics)));
  const templateData = mergeTemplateData(partials.map((item) => item.templateData).filter(Boolean) as SummaryTemplateData[]);
  return { summary, keyPoints, actionItems, decisions, topics, templateData };
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

  async summarize(content: TranscriptContent, options?: { language?: SummaryLanguage }): Promise<SummaryResult> {
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
        { role: 'system', content: buildSummarySystemPrompt(options?.language) },
        { role: 'user', content: buildSummaryUserPrompt(chunk.text) }
      ]);
      partials.push(parseSummaryResult(response));
    }

    const merged = partials.length === 1 ? partials[0] : mergePartialSummaries(partials);
    const redacted = redactSummary(merged);
    const template = renderSummaryTemplate(redacted, { language: options?.language });
    if (!template.trim()) {
      throw new OutputValidationError('Summary output is empty after rendering.');
    }

    return { ...redacted, summary: template, template };
  }
}
