import { SummaryResult, SummaryTemplateData } from './schema.js';
import { getSummaryTemplateLabels } from '../i18n/summaryTemplateCatalog.js';
import { SUMMARY_LIMITS } from './summaryLimits.js';

export type SummaryCardLanguage = 'en' | 'es' | 'ro' | string;

const MAX_FIELD_CHARS = 140;

const valueOrNotProvided = (value: string | undefined, notProvided: string): string => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : notProvided;
};

const valueOrNotFound = (value: string | undefined, notFound: string): string => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : notFound;
};

const normalizeList = (lines: string[]) => lines.map((line) => line.trim()).filter(Boolean);

const bulletLines = (lines: string[]) => lines.map((line) => `- ${line}`).join('\n');

const truncateLine = (line: string, maxLength: number) => {
  if (line.length <= maxLength) {
    return line;
  }
  return `${line.slice(0, maxLength - 3).trimEnd()}...`;
};

const firstSentence = (text: string): string => {
  const match = text.match(/^[^.!?]+[.!?]?/);
  return match ? match[0].trim() : text.trim();
};

const clampField = (value: string): string => {
  return truncateLine(firstSentence(value), MAX_FIELD_CHARS);
};

const bulletsOrFallback = (lines: string[], notProvided: string) => {
  const normalized = normalizeList(lines);
  return bulletLines(normalized.length ? normalized : [notProvided]);
};

const ensureMinCount = <T,>(items: T[], minCount: number, filler: () => T): T[] => {
  const result = [...items];
  while (result.length < minCount) {
    result.push(filler());
  }
  return result;
};

const stepsOrFallback = (lines: string[], notProvided: string, stepLabel: string) => {
  const normalized = normalizeList(lines);
  const resolved = ensureMinCount(normalized.length ? normalized : [notProvided], 2, () => notProvided).slice(
    0,
    SUMMARY_LIMITS.nextStepsPerParty
  );
  return resolved.map((line, index) => `${stepLabel} ${index + 1}: ${line}`).join('\n');
};

const buildTemplateData = (result: SummaryResult): SummaryTemplateData => {
  const templateData = result.templateData;
  const meetingPurpose = templateData?.meetingPurpose?.trim() || '';

  const actionItemsDetailed = (
    templateData?.actionItemsDetailed?.length
      ? templateData.actionItemsDetailed
      : result.actionItems.map((action) => ({ action, owner: '', dueDate: '', notes: '' }))
  ).slice(0, SUMMARY_LIMITS.actionItems);

  const keyPointsDetailed = (
    templateData?.keyPointsDetailed?.length
      ? templateData.keyPointsDetailed
      : result.keyPoints.map((title) => ({ title, explanation: '' }))
  ).slice(0, SUMMARY_LIMITS.keyPoints);

  const topicsDetailed = (
    templateData?.topicsDetailed?.length
      ? templateData.topicsDetailed
      : result.topics.map((topic) => ({
          topic,
          issueDescription: '',
          observations: [],
          rootCause: '',
          impact: ''
        }))
  )
    .slice(0, SUMMARY_LIMITS.topics)
    .map((topic) => ({
      ...topic,
      observations: topic.observations.slice(0, SUMMARY_LIMITS.observationsPerTopic)
    }));

  return {
    meetingHeader: templateData?.meetingHeader ?? {
      meetingTitle: '',
      companiesParties: '',
      date: '',
      duration: '',
      linkReference: ''
    },
    actionItemsDetailed,
    meetingPurpose,
    keyPointsDetailed,
    topicsDetailed,
    pathForward: templateData?.pathForward ?? {
      definitionOfSuccess: '',
      agreedNextAttempt: '',
      decisionPoint: '',
      checkpointDate: ''
    },
    nextSteps: templateData?.nextSteps ?? {
      partyA: { name: '', steps: [] },
      partyB: { name: '', steps: [] }
    }
  };
};

const textBlock = (
  text: string,
  options?: { weight?: string; size?: string; isSubtle?: boolean; spacing?: string }
) => ({
  type: 'TextBlock',
  text,
  wrap: true,
  ...(options ?? {})
});

const richLabelValue = (label: string, value: string, options?: { spacing?: string }) => ({
  type: 'RichTextBlock',
  ...(options ?? {}),
  inlines: [
    {
      type: 'TextRun',
      text: label,
      weight: 'Bolder'
    },
    {
      type: 'TextRun',
      text: ` ${value}`
    }
  ]
});

const richLabelLines = (label: string, lines: string, options?: { spacing?: string }) => ({
  type: 'RichTextBlock',
  ...(options ?? {}),
  inlines: [
    {
      type: 'TextRun',
      text: `${label}\n`,
      weight: 'Bolder'
    },
    {
      type: 'TextRun',
      text: lines
    }
  ]
});

export const buildSummaryAdaptiveCard = (result: SummaryResult, options?: { language?: SummaryCardLanguage }) => {
  const labels = getSummaryTemplateLabels(options?.language);
  const fallbackLabels = getSummaryTemplateLabels('en');
  const labelOrFallback = (label: string, fallback: string) => (label?.trim() ? label : fallback);
  const resolved = {
    summaryTitle: labelOrFallback(labels.summaryTitle, fallbackLabels.summaryTitle),
    meetingHeader: labelOrFallback(labels.meetingHeader, fallbackLabels.meetingHeader),
    meetingTitle: labelOrFallback(labels.meetingTitle, fallbackLabels.meetingTitle),
    companiesParties: labelOrFallback(labels.companiesParties, fallbackLabels.companiesParties),
    date: labelOrFallback(labels.date, fallbackLabels.date),
    duration: labelOrFallback(labels.duration, fallbackLabels.duration),
    linkReference: labelOrFallback(labels.linkReference, fallbackLabels.linkReference),
    actionItems: labelOrFallback(labels.actionItems, fallbackLabels.actionItems),
    forEachAction: labelOrFallback(labels.forEachAction, fallbackLabels.forEachAction),
    actionVerbObject: labelOrFallback(labels.actionVerbObject, fallbackLabels.actionVerbObject),
    owner: labelOrFallback(labels.owner, fallbackLabels.owner),
    dueDate: labelOrFallback(labels.dueDate, fallbackLabels.dueDate),
    notesContext: labelOrFallback(labels.notesContext, fallbackLabels.notesContext),
    meetingPurpose: labelOrFallback(labels.meetingPurpose, fallbackLabels.meetingPurpose),
    purposeOneSentence: labelOrFallback(labels.purposeOneSentence, fallbackLabels.purposeOneSentence),
    keyPoints: labelOrFallback(labels.keyPoints, fallbackLabels.keyPoints),
    shortListEachPoint: labelOrFallback(labels.shortListEachPoint, fallbackLabels.shortListEachPoint),
    pointTitle: labelOrFallback(labels.pointTitle, fallbackLabels.pointTitle),
    pointExplanation: labelOrFallback(labels.pointExplanation, fallbackLabels.pointExplanation),
    topicsDetailed: labelOrFallback(labels.topicsDetailed, fallbackLabels.topicsDetailed),
    topic: labelOrFallback(labels.topic, fallbackLabels.topic),
    issueDescription: labelOrFallback(labels.issueDescription, fallbackLabels.issueDescription),
    keyObservations: labelOrFallback(labels.keyObservations, fallbackLabels.keyObservations),
    rootCause: labelOrFallback(labels.rootCause, fallbackLabels.rootCause),
    impact: labelOrFallback(labels.impact, fallbackLabels.impact),
    pathForward: labelOrFallback(labels.pathForward, fallbackLabels.pathForward),
    definitionOfSuccess: labelOrFallback(labels.definitionOfSuccess, fallbackLabels.definitionOfSuccess),
    agreedNextAttempt: labelOrFallback(labels.agreedNextAttempt, fallbackLabels.agreedNextAttempt),
    decisionPoint: labelOrFallback(labels.decisionPoint, fallbackLabels.decisionPoint),
    checkpointDate: labelOrFallback(labels.checkpointDate, fallbackLabels.checkpointDate),
    nextSteps: labelOrFallback(labels.nextSteps, fallbackLabels.nextSteps),
    partyA: labelOrFallback(labels.partyA, fallbackLabels.partyA),
    partyB: labelOrFallback(labels.partyB, fallbackLabels.partyB),
    step: labelOrFallback(labels.step, fallbackLabels.step),
    notProvided: labelOrFallback(labels.notProvided, fallbackLabels.notProvided),
    notFound: labelOrFallback(labels.notFound, fallbackLabels.notFound)
  };
  const data = buildTemplateData(result);
  const notProvided = resolved.notProvided;
  const notFound = resolved.notFound;

  const actionItems = ensureMinCount(
    data.actionItemsDetailed.length ? data.actionItemsDetailed : [{ action: '', owner: '', dueDate: '', notes: '' }],
    2,
    () => ({ action: '', owner: '', dueDate: '', notes: '' })
  ).slice(0, SUMMARY_LIMITS.actionItems);

  const keyPoints = ensureMinCount(
    data.keyPointsDetailed.length ? data.keyPointsDetailed : [{ title: '', explanation: '' }],
    2,
    () => ({ title: '', explanation: '' })
  ).slice(0, SUMMARY_LIMITS.keyPoints);

  const topics = ensureMinCount(
    data.topicsDetailed.length
      ? data.topicsDetailed
      : [{ topic: '', issueDescription: '', observations: [], rootCause: '', impact: '' }],
    2,
    () => ({ topic: '', issueDescription: '', observations: [], rootCause: '', impact: '' })
  ).slice(0, SUMMARY_LIMITS.topics);

  const partyAName = clampField(valueOrNotProvided(data.nextSteps.partyA.name, notProvided));
  const partyBName = clampField(valueOrNotProvided(data.nextSteps.partyB.name, notProvided));

  const body = [
    textBlock(resolved.summaryTitle, { weight: 'Bolder', size: 'Large' }),
    textBlock(resolved.meetingHeader, { weight: 'Bolder', size: 'Medium', spacing: 'Medium' }),
    richLabelValue(resolved.meetingTitle, clampField(valueOrNotFound(data.meetingHeader.meetingTitle, notFound))),
    richLabelValue(resolved.companiesParties, clampField(valueOrNotFound(data.meetingHeader.companiesParties, notFound))),
    richLabelValue(resolved.date, clampField(valueOrNotFound(data.meetingHeader.date, notFound))),
    richLabelValue(resolved.duration, clampField(valueOrNotFound(data.meetingHeader.duration, notFound))),
    richLabelValue(resolved.linkReference, clampField(valueOrNotFound(data.meetingHeader.linkReference, notFound))),
    textBlock(resolved.actionItems, { weight: 'Bolder', size: 'Medium', spacing: 'Medium' }),
    textBlock(resolved.forEachAction, { isSubtle: true, spacing: 'Small' }),
    ...actionItems.flatMap((item) => [
      richLabelValue(resolved.actionVerbObject, clampField(valueOrNotProvided(item.action, notProvided))),
      richLabelValue(resolved.owner, clampField(valueOrNotProvided(item.owner, notProvided))),
      richLabelValue(resolved.dueDate, clampField(valueOrNotProvided(item.dueDate, notProvided))),
      richLabelValue(resolved.notesContext, clampField(valueOrNotProvided(item.notes, notProvided)))
    ]),
    textBlock(resolved.meetingPurpose, { weight: 'Bolder', size: 'Medium', spacing: 'Medium' }),
    richLabelValue(resolved.purposeOneSentence, clampField(valueOrNotProvided(data.meetingPurpose, notProvided))),
    textBlock(resolved.keyPoints, { weight: 'Bolder', size: 'Medium', spacing: 'Medium' }),
    textBlock(resolved.shortListEachPoint, { isSubtle: true, spacing: 'Small' }),
    ...keyPoints.flatMap((point) => [
      richLabelValue(resolved.pointTitle, clampField(valueOrNotProvided(point.title, notProvided))),
      richLabelValue(resolved.pointExplanation, clampField(valueOrNotProvided(point.explanation, notProvided)))
    ]),
    textBlock(resolved.topicsDetailed, { weight: 'Bolder', size: 'Medium', spacing: 'Medium' }),
    ...topics.flatMap((topic) => {
      const observationLines = ensureMinCount(
        normalizeList(topic.observations).length ? normalizeList(topic.observations) : [notProvided],
        2,
        () => notProvided
      ).slice(0, SUMMARY_LIMITS.observationsPerTopic);
      return [
        richLabelValue(resolved.topic, clampField(valueOrNotProvided(topic.topic, notProvided))),
        richLabelValue(resolved.issueDescription, clampField(valueOrNotProvided(topic.issueDescription, notProvided))),
        richLabelLines(resolved.keyObservations, bulletsOrFallback(observationLines.map(clampField), notProvided)),
        richLabelValue(resolved.rootCause, clampField(valueOrNotProvided(topic.rootCause, notProvided))),
        richLabelValue(resolved.impact, clampField(valueOrNotProvided(topic.impact, notProvided)))
      ];
    }),
    textBlock(resolved.pathForward, { weight: 'Bolder', size: 'Medium', spacing: 'Medium' }),
    richLabelValue(resolved.definitionOfSuccess, clampField(valueOrNotProvided(data.pathForward.definitionOfSuccess, notProvided))),
    richLabelValue(resolved.agreedNextAttempt, clampField(valueOrNotProvided(data.pathForward.agreedNextAttempt, notProvided))),
    richLabelValue(resolved.decisionPoint, clampField(valueOrNotProvided(data.pathForward.decisionPoint, notProvided))),
    richLabelValue(resolved.checkpointDate, clampField(valueOrNotProvided(data.pathForward.checkpointDate, notProvided))),
    textBlock(resolved.nextSteps, { weight: 'Bolder', size: 'Medium', spacing: 'Medium' }),
    richLabelValue(resolved.partyA, partyAName, { spacing: 'Small' }),
    textBlock(stepsOrFallback(data.nextSteps.partyA.steps, notProvided, resolved.step), { spacing: 'None' }),
    richLabelValue(resolved.partyB, partyBName, { spacing: 'Medium' }),
    textBlock(stepsOrFallback(data.nextSteps.partyB.steps, notProvided, resolved.step), { spacing: 'None' })
  ];

  return {
    contentType: 'application/vnd.microsoft.card.adaptive',
    content: {
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      type: 'AdaptiveCard',
      version: '1.4',
      msteams: { width: 'Full' },
      body
    }
  };
};
