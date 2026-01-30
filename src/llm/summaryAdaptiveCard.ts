import { SummaryResult, SummaryTemplateData } from './schema.js';
import { getSummaryTemplateLabels } from '../i18n/summaryTemplateCatalog.js';
import { SUMMARY_LIMITS } from './summaryLimits.js';

export type SummaryCardLanguage = 'en' | 'es' | 'ro' | string;

const normalizeText = (value?: string) => value?.trim() ?? '';

const valueOrNotProvided = (value: string | undefined, notProvided: string): string => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : notProvided;
};

const normalizeList = (lines: string[]) => lines.map((line) => line.trim()).filter(Boolean);

const joinParts = (parts: string[]) => normalizeList(parts).join(' | ');

const bulletLines = (lines: string[]) => lines.map((line) => `- ${line}`).join('\n');

const bulletsOrFallback = (lines: string[], notProvided: string) => {
  const normalized = normalizeList(lines);
  return bulletLines(normalized.length ? normalized : [notProvided]);
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

  const meetingTitle = normalizeText(data.meetingHeader.meetingTitle) || 'Meeting summary';
  const metaLine = joinParts([
    data.meetingHeader.companiesParties,
    data.meetingHeader.date,
    data.meetingHeader.duration
  ]);
  const linkReference = normalizeText(data.meetingHeader.linkReference);
  const meetingPurpose = normalizeText(data.meetingPurpose);

  const keyPointLines = data.keyPointsDetailed.map((point) => {
    const title = valueOrNotProvided(point.title, notProvided);
    const explanation = normalizeText(point.explanation);
    return explanation ? `${title} - ${explanation}` : title;
  });

  const decisionLines = normalizeList(result.decisions);

  const actionLines = data.actionItemsDetailed.map((item) => {
    const action = valueOrNotProvided(item.action, notProvided);
    const owner = normalizeText(item.owner);
    const due = normalizeText(item.dueDate);
    const meta = joinParts([owner, due]);
    return meta ? `${action} (${meta})` : action;
  });

  const topics = data.topicsDetailed.length
    ? data.topicsDetailed
    : [{ topic: '', issueDescription: '', observations: [], rootCause: '', impact: '' }];

  const partyALabel = normalizeText(data.nextSteps.partyA.name) || labels.partyA;
  const partyBLabel = normalizeText(data.nextSteps.partyB.name) || labels.partyB;

  const body = [
    {
      type: 'Container',
      style: 'emphasis',
      bleed: true,
      items: [
        textBlock(meetingTitle, { weight: 'Bolder', size: 'Large' }),
        ...(metaLine ? [textBlock(metaLine, { isSubtle: true, spacing: 'Small' })] : []),
        ...(linkReference ? [textBlock(linkReference, { isSubtle: true, spacing: 'None' })] : [])
      ]
    },
    ...(meetingPurpose
      ? [textBlock(`${labels.meetingPurpose}: ${meetingPurpose}`, { isSubtle: true, spacing: 'Small' })]
      : []),
    {
      type: 'ColumnSet',
      spacing: 'Medium',
      columns: [
        {
          type: 'Column',
          width: 'stretch',
          items: [
            textBlock(labels.keyPoints, { weight: 'Bolder', size: 'Medium' }),
            textBlock(bulletsOrFallback(keyPointLines, notProvided), { spacing: 'Small' })
          ]
        },
        {
          type: 'Column',
          width: 'stretch',
          items: [
            textBlock('Decisions', { weight: 'Bolder', size: 'Medium' }),
            textBlock(bulletsOrFallback(decisionLines, notProvided), { spacing: 'Small' }),
            textBlock(labels.actionItems, { weight: 'Bolder', size: 'Medium', spacing: 'Medium' }),
            textBlock(bulletsOrFallback(actionLines, notProvided), { spacing: 'Small' })
          ]
        }
      ]
    },
    {
      type: 'Container',
      separator: true,
      spacing: 'Medium',
      items: [
        textBlock(labels.topicsDetailed, { weight: 'Bolder', size: 'Medium' }),
        ...topics.flatMap((topic, index) => {
          const topicTitle = valueOrNotProvided(topic.topic, notProvided);
          const issueDescription = normalizeText(topic.issueDescription);
          const observations = normalizeList(topic.observations);
          const observationLines = observations.length
            ? observations
            : issueDescription
              ? [issueDescription]
              : [notProvided];
          return [
            textBlock(topicTitle, { weight: 'Bolder', spacing: index === 0 ? 'Small' : 'Medium' }),
            ...(issueDescription ? [textBlock(issueDescription, { isSubtle: true, spacing: 'None' })] : []),
            textBlock(labels.keyObservations, { isSubtle: true, spacing: 'Small' }),
            textBlock(bulletsOrFallback(observationLines, notProvided), { spacing: 'None' })
          ];
        })
      ]
    },
    {
      type: 'Container',
      separator: true,
      spacing: 'Medium',
      items: [
        textBlock(labels.nextSteps, { weight: 'Bolder', size: 'Medium' }),
        textBlock(partyALabel, { weight: 'Bolder', spacing: 'Small' }),
        textBlock(bulletsOrFallback(data.nextSteps.partyA.steps, notProvided), { spacing: 'None' }),
        textBlock(partyBLabel, { weight: 'Bolder', spacing: 'Medium' }),
        textBlock(bulletsOrFallback(data.nextSteps.partyB.steps, notProvided), { spacing: 'None' })
      ]
    }
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

export const buildSummaryLoadingCard = (options?: {
  title?: string;
  subtitle?: string;
  steps?: string[];
}) => {
  const title = options?.title?.trim() || 'Meeting summary';
  const subtitle = options?.subtitle?.trim() || 'Working on it...';
  const steps =
    options?.steps?.length
      ? options.steps
      : ['Reading transcript', 'Extracting decisions and actions', 'Formatting the summary'];

  return {
    contentType: 'application/vnd.microsoft.card.adaptive',
    content: {
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      type: 'AdaptiveCard',
      version: '1.5',
      msteams: { width: 'Full' },
      body: [
        {
          type: 'Container',
          style: 'emphasis',
          bleed: true,
          items: [
            textBlock(title, { weight: 'Bolder', size: 'Large' }),
            textBlock(subtitle, { isSubtle: true, spacing: 'Small' })
          ]
        },
        ...steps.map((step, index) =>
          textBlock(`${index + 1}. ${step}`, { spacing: index === 0 ? 'Medium' : 'Small' })
        )
      ]
    }
  };
};
