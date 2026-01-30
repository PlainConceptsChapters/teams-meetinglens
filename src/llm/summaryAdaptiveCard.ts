import { SummaryResult, SummaryTemplateData } from './schema.js';
import { getSummaryTemplateLabels } from '../i18n/summaryTemplateCatalog.js';
import { SUMMARY_LIMITS } from './summaryLimits.js';

export type SummaryCardLanguage = 'en' | 'es' | 'ro' | string;

const valueOrNotProvided = (value: string | undefined, notProvided: string): string => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : notProvided;
};

const normalizeSteps = (steps: string[], minCount: number, notProvided: string): string[] => {
  const filtered = steps.map((step) => step.trim()).filter(Boolean);
  while (filtered.length < minCount) {
    filtered.push(notProvided);
  }
  return filtered.slice(0, SUMMARY_LIMITS.nextStepsPerParty);
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

const textBlock = (text: string, options?: { weight?: string; size?: string; isSubtle?: boolean; spacing?: string }) => ({
  type: 'TextBlock',
  text,
  wrap: true,
  ...(options ?? {})
});

const bulletLines = (lines: string[]) => lines.map((line) => `- ${line}`).join('\n');

export const buildSummaryAdaptiveCard = (result: SummaryResult, options?: { language?: SummaryCardLanguage }) => {
  const labels = getSummaryTemplateLabels(options?.language);
  const data = buildTemplateData(result);
  const notProvided = labels.notProvided;

  const actionItems = data.actionItemsDetailed.length
    ? data.actionItemsDetailed
    : [{ action: '', owner: '', dueDate: '', notes: '' }];

  const keyPoints = data.keyPointsDetailed.length ? data.keyPointsDetailed : [{ title: '', explanation: '' }];

  const topics = data.topicsDetailed.length
    ? data.topicsDetailed
    : [{ topic: '', issueDescription: '', observations: [], rootCause: '', impact: '' }];

  const partyASteps = normalizeSteps(data.nextSteps.partyA.steps, 2, notProvided);
  const partyBSteps = normalizeSteps(data.nextSteps.partyB.steps, 2, notProvided);

  return {
    contentType: 'application/vnd.microsoft.card.adaptive',
    content: {
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        textBlock(`1. ${labels.meetingHeader}`, { weight: 'Bolder', size: 'Medium' }),
        {
          type: 'FactSet',
          facts: [
            {
              title: labels.meetingTitle,
              value: valueOrNotProvided(data.meetingHeader.meetingTitle, notProvided)
            },
            {
              title: labels.companiesParties,
              value: valueOrNotProvided(data.meetingHeader.companiesParties, notProvided)
            },
            {
              title: labels.date,
              value: valueOrNotProvided(data.meetingHeader.date, notProvided)
            },
            {
              title: labels.duration,
              value: valueOrNotProvided(data.meetingHeader.duration, notProvided)
            },
            {
              title: labels.linkReference,
              value: valueOrNotProvided(data.meetingHeader.linkReference, notProvided)
            }
          ]
        },
        textBlock(`2. ${labels.actionItems}`, { weight: 'Bolder', size: 'Medium', spacing: 'Medium' }),
        textBlock(labels.forEachAction, { isSubtle: true }),
        ...actionItems.flatMap((item) => [
          textBlock(`${labels.actionVerbObject} ${valueOrNotProvided(item.action, notProvided)}`, { weight: 'Bolder' }),
          {
            type: 'FactSet',
            facts: [
              {
                title: labels.owner,
                value: valueOrNotProvided(item.owner, notProvided)
              },
              {
                title: labels.dueDate,
                value: valueOrNotProvided(item.dueDate, notProvided)
              },
              {
                title: labels.notesContext,
                value: valueOrNotProvided(item.notes, notProvided)
              }
            ]
          }
        ]),
        textBlock(`3. ${labels.meetingPurpose}`, { weight: 'Bolder', size: 'Medium', spacing: 'Medium' }),
        textBlock(`${labels.purposeOneSentence} ${valueOrNotProvided(data.meetingPurpose, notProvided)}`),
        textBlock(`4. ${labels.keyPoints}`, { weight: 'Bolder', size: 'Medium', spacing: 'Medium' }),
        textBlock(labels.shortListEachPoint, { isSubtle: true }),
        ...keyPoints.flatMap((point) => [
          textBlock(`${labels.pointTitle} ${valueOrNotProvided(point.title, notProvided)}`, { weight: 'Bolder' }),
          textBlock(`${labels.pointExplanation} ${valueOrNotProvided(point.explanation, notProvided)}`)
        ]),
        textBlock(`5. ${labels.topicsDetailed}`, { weight: 'Bolder', size: 'Medium', spacing: 'Medium' }),
        ...topics.flatMap((topic) => [
          textBlock(`${labels.topic} ${valueOrNotProvided(topic.topic, notProvided)}`, { weight: 'Bolder' }),
          textBlock(`${labels.issueDescription} ${valueOrNotProvided(topic.issueDescription, notProvided)}`),
          textBlock(`${labels.keyObservations}\n${bulletLines(
            (topic.observations.length ? topic.observations : [notProvided]).map((obs) =>
              valueOrNotProvided(obs, notProvided)
            )
          )}`),
          textBlock(`${labels.rootCause} ${valueOrNotProvided(topic.rootCause, notProvided)}`),
          textBlock(`${labels.impact} ${valueOrNotProvided(topic.impact, notProvided)}`)
        ]),
        textBlock(`6. ${labels.pathForward}`, { weight: 'Bolder', size: 'Medium', spacing: 'Medium' }),
        {
          type: 'FactSet',
          facts: [
            {
              title: labels.definitionOfSuccess,
              value: valueOrNotProvided(data.pathForward.definitionOfSuccess, notProvided)
            },
            {
              title: labels.agreedNextAttempt,
              value: valueOrNotProvided(data.pathForward.agreedNextAttempt, notProvided)
            },
            {
              title: labels.decisionPoint,
              value: valueOrNotProvided(data.pathForward.decisionPoint, notProvided)
            },
            {
              title: labels.checkpointDate,
              value: valueOrNotProvided(data.pathForward.checkpointDate, notProvided)
            }
          ]
        },
        textBlock(`7. ${labels.nextSteps}`, { weight: 'Bolder', size: 'Medium', spacing: 'Medium' }),
        textBlock(`${labels.partyA} ${valueOrNotProvided(data.nextSteps.partyA.name, notProvided)}`, { weight: 'Bolder' }),
        textBlock(bulletLines(partyASteps.map((step, index) => `${index + 1}. ${step}`))),
        textBlock(`${labels.partyB} ${valueOrNotProvided(data.nextSteps.partyB.name, notProvided)}`, { weight: 'Bolder' }),
        textBlock(bulletLines(partyBSteps.map((step, index) => `${index + 1}. ${step}`)))
      ]
    }
  };
};
