import { SummaryResult, SummaryTemplateData } from './schema.js';
import { getSummaryTemplateLabels } from '../i18n/summaryTemplateCatalog.js';

export type SummaryTemplateLanguage = 'en' | 'es' | 'ro' | string;

const valueOrNotProvided = (value: string | undefined, notProvided: string): string => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : notProvided;
};

const normalizeSteps = (steps: string[], minCount: number, notProvided: string): string[] => {
  const filtered = steps.map((step) => step.trim()).filter(Boolean);
  while (filtered.length < minCount) {
    filtered.push(notProvided);
  }
  return filtered;
};

const buildTemplateData = (result: SummaryResult): SummaryTemplateData => {
  const templateData = result.templateData;
  const meetingPurpose = templateData?.meetingPurpose?.trim() || '';

  const actionItemsDetailed =
    templateData?.actionItemsDetailed?.length
      ? templateData.actionItemsDetailed
      : result.actionItems.map((action) => ({ action, owner: '', dueDate: '', notes: '' }));

  const keyPointsDetailed =
    templateData?.keyPointsDetailed?.length
      ? templateData.keyPointsDetailed
      : result.keyPoints.map((title) => ({ title, explanation: '' }));

  const topicsDetailed =
    templateData?.topicsDetailed?.length
      ? templateData.topicsDetailed
      : result.topics.map((topic) => ({
          topic,
          issueDescription: '',
          observations: [],
          rootCause: '',
          impact: ''
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

export const renderSummaryTemplate = (result: SummaryResult, options?: { language?: SummaryTemplateLanguage }): string => {
  const l = getSummaryTemplateLabels(options?.language);
  const data = buildTemplateData(result);
  const notProvided = l.notProvided;

  const lines: string[] = [];

  lines.push(`**1. ${l.meetingHeader}**`);
  lines.push(`   **${l.meetingTitle}** ${valueOrNotProvided(data.meetingHeader.meetingTitle, notProvided)}`);
  lines.push(`   **${l.companiesParties}** ${valueOrNotProvided(data.meetingHeader.companiesParties, notProvided)}`);
  lines.push(`   **${l.date}** ${valueOrNotProvided(data.meetingHeader.date, notProvided)}`);
  lines.push(`   **${l.duration}** ${valueOrNotProvided(data.meetingHeader.duration, notProvided)}`);
  lines.push(`   **${l.linkReference}** ${valueOrNotProvided(data.meetingHeader.linkReference, notProvided)}`);

  lines.push(`**2. ${l.actionItems}**`);
  lines.push(`   *${l.forEachAction}*`);

  const actionItems = data.actionItemsDetailed.length
    ? data.actionItemsDetailed
    : [{ action: '', owner: '', dueDate: '', notes: '' }];

  for (const item of actionItems) {
    lines.push(`   **${l.actionVerbObject}** ${valueOrNotProvided(item.action, notProvided)}`);
    lines.push(`   **${l.owner}** ${valueOrNotProvided(item.owner, notProvided)}`);
    lines.push(`   **${l.dueDate}** ${valueOrNotProvided(item.dueDate, notProvided)}`);
    lines.push(`   **${l.notesContext}** ${valueOrNotProvided(item.notes, notProvided)}`);
  }

  lines.push(`**3. ${l.meetingPurpose}**`);
  lines.push(`   **${l.purposeOneSentence}** ${valueOrNotProvided(data.meetingPurpose, notProvided)}`);

  lines.push(`**4. ${l.keyPoints}**`);
  lines.push(`   *${l.shortListEachPoint}*`);

  const keyPoints = data.keyPointsDetailed.length ? data.keyPointsDetailed : [{ title: '', explanation: '' }];
  for (const point of keyPoints) {
    lines.push(`   **${l.pointTitle}** ${valueOrNotProvided(point.title, notProvided)}`);
    lines.push(`   **${l.pointExplanation}** ${valueOrNotProvided(point.explanation, notProvided)}`);
  }

  lines.push(`**5. ${l.topicsDetailed}**`);

  const topics = data.topicsDetailed.length
    ? data.topicsDetailed
    : [{ topic: '', issueDescription: '', observations: [], rootCause: '', impact: '' }];

  for (const topic of topics) {
    lines.push(`   **${l.topic}** ${valueOrNotProvided(topic.topic, notProvided)}`);
    lines.push(`   **${l.issueDescription}** ${valueOrNotProvided(topic.issueDescription, notProvided)}`);
    lines.push(`   **${l.keyObservations}**`);

    const observations = topic.observations.length ? topic.observations : [notProvided];
    for (const obs of observations) {
      lines.push(`     - ${valueOrNotProvided(obs, notProvided)}`);
    }

    lines.push(`   **${l.rootCause}** ${valueOrNotProvided(topic.rootCause, notProvided)}`);
    lines.push(`   **${l.impact}** ${valueOrNotProvided(topic.impact, notProvided)}`);
  }

  lines.push(`**6. ${l.pathForward}**`);
  lines.push(`   **${l.definitionOfSuccess}** ${valueOrNotProvided(data.pathForward.definitionOfSuccess, notProvided)}`);
  lines.push(`   **${l.agreedNextAttempt}** ${valueOrNotProvided(data.pathForward.agreedNextAttempt, notProvided)}`);
  lines.push(`   **${l.decisionPoint}** ${valueOrNotProvided(data.pathForward.decisionPoint, notProvided)}`);
  lines.push(`   **${l.checkpointDate}** ${valueOrNotProvided(data.pathForward.checkpointDate, notProvided)}`);

  lines.push(`**7. ${l.nextSteps}**`);

  const partyALabel = data.nextSteps.partyA.name ? `${l.partyA} ${data.nextSteps.partyA.name}` : l.partyA;
  lines.push(`   **${partyALabel}**`);
  const partyASteps = normalizeSteps(data.nextSteps.partyA.steps, 2, notProvided);
  partyASteps.forEach((step, index) => {
    lines.push(`   **${l.step} ${index + 1}** ${valueOrNotProvided(step, notProvided)}`);
  });

  const partyBLabel = data.nextSteps.partyB.name ? `${l.partyB} ${data.nextSteps.partyB.name}` : l.partyB;
  lines.push(`   **${partyBLabel}**`);
  const partyBSteps = normalizeSteps(data.nextSteps.partyB.steps, 2, notProvided);
  partyBSteps.forEach((step, index) => {
    lines.push(`   **${l.step} ${index + 1}** ${valueOrNotProvided(step, notProvided)}`);
  });

  return lines.join('\n');
};
