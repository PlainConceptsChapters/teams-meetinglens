import { SummaryResult, SummaryTemplateData } from './schema.js';
import { getSummaryTemplateLabels } from '../i18n/summaryTemplateCatalog.js';
import { SUMMARY_LIMITS } from './summaryLimits.js';

export type SummaryCardLanguage = 'en' | 'es' | 'ro' | string;

const normalizeText = (value?: string) => value?.trim() ?? '';

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

export const buildSummaryAdaptiveCard = (result: SummaryResult, options?: { language?: SummaryCardLanguage }) => {
  const labels = getSummaryTemplateLabels(options?.language);
  const data = buildTemplateData(result);
  const notProvided = labels.notProvided;
  const notFound = labels.notFound;

  const meetingTitle = normalizeText(data.meetingHeader.meetingTitle) || labels.summaryTitle;

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

  const partyALabel = normalizeText(data.nextSteps.partyA.name) || labels.partyA;
  const partyBLabel = normalizeText(data.nextSteps.partyB.name) || labels.partyB;

  const keyPointLines = keyPoints.map((point) => {
    const title = clampField(valueOrNotProvided(point.title, notProvided));
    const explanation = clampField(normalizeText(point.explanation));
    const line = explanation ? `${title} - ${explanation}` : title;
    return truncateLine(line, MAX_FIELD_CHARS);
  });

  const actionLines = actionItems.map((item) => {
    const action = clampField(valueOrNotProvided(item.action, notProvided));
    const owner = clampField(normalizeText(item.owner));
    const due = clampField(normalizeText(item.dueDate));
    const notes = clampField(normalizeText(item.notes));
    const meta = normalizeList([owner, due, notes]).join(', ');
    const line = meta ? `${action} (${meta})` : action;
    return truncateLine(line, MAX_FIELD_CHARS);
  });

  const body = [
    {
      type: 'Container',
      style: 'emphasis',
      bleed: true,
      items: [
        textBlock(meetingTitle, { weight: 'Bolder', size: 'Large' })
      ]
    },
    textBlock(labels.meetingHeader, { weight: 'Bolder', size: 'Medium', spacing: 'Medium' }),
    {
      type: 'FactSet',
      facts: [
        {
          title: labels.meetingTitle,
          value: clampField(valueOrNotFound(data.meetingHeader.meetingTitle, notFound))
        },
        {
          title: labels.companiesParties,
          value: clampField(valueOrNotFound(data.meetingHeader.companiesParties, notFound))
        },
        {
          title: labels.date,
          value: clampField(valueOrNotFound(data.meetingHeader.date, notFound))
        },
        {
          title: labels.duration,
          value: clampField(valueOrNotFound(data.meetingHeader.duration, notFound))
        },
        {
          title: labels.linkReference,
          value: clampField(valueOrNotFound(data.meetingHeader.linkReference, notFound))
        }
      ]
    },
    textBlock(labels.meetingPurpose, { weight: 'Bolder', size: 'Medium', spacing: 'Medium' }),
    textBlock(`${labels.purposeOneSentence} ${clampField(valueOrNotProvided(data.meetingPurpose, notProvided))}`),
    textBlock(labels.keyPoints, { weight: 'Bolder', size: 'Medium', spacing: 'Medium' }),
    textBlock(labels.shortListEachPoint, { isSubtle: true, spacing: 'Small' }),
    textBlock(bulletsOrFallback(keyPointLines, notProvided)),
    textBlock(labels.actionItems, { weight: 'Bolder', size: 'Medium', spacing: 'Medium' }),
    textBlock(labels.forEachAction, { isSubtle: true, spacing: 'Small' }),
    textBlock(bulletsOrFallback(actionLines, notProvided)),
    textBlock(labels.topicsDetailed, { weight: 'Bolder', size: 'Medium', spacing: 'Medium' }),
    ...topics.flatMap((topic) => {
      const observationLines = ensureMinCount(
        normalizeList(topic.observations).length ? normalizeList(topic.observations) : [notProvided],
        2,
        () => notProvided
      ).slice(0, SUMMARY_LIMITS.observationsPerTopic);
      return [
        textBlock(`${labels.topic} ${clampField(valueOrNotProvided(topic.topic, notProvided))}`, { weight: 'Bolder' }),
        textBlock(`${labels.issueDescription} ${clampField(valueOrNotProvided(topic.issueDescription, notProvided))}`),
        textBlock(
          `${labels.keyObservations}\n${bulletsOrFallback(observationLines.map(clampField), notProvided)}`
        ),
        textBlock(`${labels.rootCause} ${clampField(valueOrNotProvided(topic.rootCause, notProvided))}`),
        textBlock(`${labels.impact} ${clampField(valueOrNotProvided(topic.impact, notProvided))}`)
      ];
    }),
    textBlock(labels.pathForward, { weight: 'Bolder', size: 'Medium', spacing: 'Medium' }),
    {
      type: 'FactSet',
      facts: [
        {
          title: labels.definitionOfSuccess,
          value: clampField(valueOrNotProvided(data.pathForward.definitionOfSuccess, notProvided))
        },
        {
          title: labels.agreedNextAttempt,
          value: clampField(valueOrNotProvided(data.pathForward.agreedNextAttempt, notProvided))
        },
        {
          title: labels.decisionPoint,
          value: clampField(valueOrNotProvided(data.pathForward.decisionPoint, notProvided))
        },
        {
          title: labels.checkpointDate,
          value: clampField(valueOrNotProvided(data.pathForward.checkpointDate, notProvided))
        }
      ]
    },
    textBlock(labels.nextSteps, { weight: 'Bolder', size: 'Medium', spacing: 'Medium' }),
    textBlock(partyALabel, { weight: 'Bolder', spacing: 'Small' }),
    textBlock(stepsOrFallback(data.nextSteps.partyA.steps, notProvided, labels.step), { spacing: 'None' }),
    textBlock(partyBLabel, { weight: 'Bolder', spacing: 'Medium' }),
    textBlock(stepsOrFallback(data.nextSteps.partyB.steps, notProvided, labels.step), { spacing: 'None' })
  ];

  return {
    contentType: 'application/vnd.microsoft.card.adaptive',
    content: {
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      type: 'AdaptiveCard',
      version: '1.5',
      msteams: { width: 'Full' },
      body
    }
  };
};
