import { SummaryResult, SummaryTemplateData } from './schema.js';
import { getSummaryTemplateLabels } from '../i18n/summaryTemplateCatalog.js';
import { SUMMARY_LIMITS } from './summaryLimits.js';

export type SummaryTemplateLanguage = 'en' | 'es' | 'ro' | string;
export type SummaryTemplateFormat = 'markdown' | 'xml' | 'plain';

const valueOrNotProvided = (value: string | undefined, notProvided: string): string => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : notProvided;
};

const valueOrNotFound = (value: string | undefined, notFound: string): string => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : notFound;
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

const escapeXml = (value: string): string => {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
};

const renderMarkdown = (data: SummaryTemplateData, labels: ReturnType<typeof getSummaryTemplateLabels>): string => {
  const notProvided = labels.notProvided;
  const notFound = labels.notFound;
  const lines: string[] = [];

  lines.push(`**1. ${labels.meetingHeader}**`);
  lines.push(`- **${labels.meetingTitle}** ${valueOrNotFound(data.meetingHeader.meetingTitle, notFound)}`);
  lines.push(`- **${labels.companiesParties}** ${valueOrNotFound(data.meetingHeader.companiesParties, notFound)}`);
  lines.push(`- **${labels.date}** ${valueOrNotFound(data.meetingHeader.date, notFound)}`);
  lines.push(`- **${labels.duration}** ${valueOrNotFound(data.meetingHeader.duration, notFound)}`);
  lines.push(`- **${labels.linkReference}** ${valueOrNotFound(data.meetingHeader.linkReference, notFound)}`);
  lines.push('');

  lines.push(`**2. ${labels.actionItems}**`);
  lines.push(`*${labels.forEachAction}*`);

  const actionItems = data.actionItemsDetailed.length
    ? data.actionItemsDetailed
    : [{ action: '', owner: '', dueDate: '', notes: '' }];

  for (const item of actionItems) {
    lines.push(`- **${labels.actionVerbObject}** ${valueOrNotProvided(item.action, notProvided)}`);
    lines.push(`  - **${labels.owner}** ${valueOrNotProvided(item.owner, notProvided)}`);
    lines.push(`  - **${labels.dueDate}** ${valueOrNotProvided(item.dueDate, notProvided)}`);
    lines.push(`  - **${labels.notesContext}** ${valueOrNotProvided(item.notes, notProvided)}`);
    lines.push('');
  }

  lines.push(`**3. ${labels.meetingPurpose}**`);
  lines.push(`- **${labels.purposeOneSentence}** ${valueOrNotProvided(data.meetingPurpose, notProvided)}`);
  lines.push('');

  lines.push(`**4. ${labels.keyPoints}**`);

  const keyPoints = data.keyPointsDetailed.length ? data.keyPointsDetailed : [{ title: '', explanation: '' }];
  for (const point of keyPoints) {
    lines.push(`- **${labels.pointTitle}** ${valueOrNotProvided(point.title, notProvided)}`);
    lines.push(`  - **${labels.pointExplanation}** ${valueOrNotProvided(point.explanation, notProvided)}`);
    lines.push('');
  }

  lines.push(`**5. ${labels.topicsDetailed}**`);

  const topics = data.topicsDetailed.length
    ? data.topicsDetailed
    : [{ topic: '', issueDescription: '', observations: [], rootCause: '', impact: '' }];

  for (const topic of topics) {
    lines.push(`- **${labels.topic}** ${valueOrNotProvided(topic.topic, notProvided)}`);
    lines.push(`  - **${labels.issueDescription}** ${valueOrNotProvided(topic.issueDescription, notProvided)}`);
    lines.push(`  - **${labels.keyObservations}**`);

    const observations = topic.observations.length ? topic.observations : [notProvided];
    for (const obs of observations) {
      lines.push(`    - ${valueOrNotProvided(obs, notProvided)}`);
    }

    lines.push(`  - **${labels.rootCause}** ${valueOrNotProvided(topic.rootCause, notProvided)}`);
    lines.push(`  - **${labels.impact}** ${valueOrNotProvided(topic.impact, notProvided)}`);
    lines.push('');
  }

  lines.push(`**6. ${labels.pathForward}**`);
  lines.push(`- **${labels.definitionOfSuccess}** ${valueOrNotProvided(data.pathForward.definitionOfSuccess, notProvided)}`);
  lines.push(`- **${labels.agreedNextAttempt}** ${valueOrNotProvided(data.pathForward.agreedNextAttempt, notProvided)}`);
  lines.push(`- **${labels.decisionPoint}** ${valueOrNotProvided(data.pathForward.decisionPoint, notProvided)}`);
  lines.push(`- **${labels.checkpointDate}** ${valueOrNotProvided(data.pathForward.checkpointDate, notProvided)}`);
  lines.push('');

  lines.push(`**7. ${labels.nextSteps}**`);

  const partyALabel = data.nextSteps.partyA.name ? `${labels.partyA} ${data.nextSteps.partyA.name}` : labels.partyA;
  lines.push(`- **${partyALabel}**`);
  const partyASteps = normalizeSteps(data.nextSteps.partyA.steps, 2, notProvided);
  partyASteps.forEach((step, index) => {
    lines.push(`  ${index + 1}. ${valueOrNotProvided(step, notProvided)}`);
  });
  lines.push('');

  const partyBLabel = data.nextSteps.partyB.name ? `${labels.partyB} ${data.nextSteps.partyB.name}` : labels.partyB;
  lines.push(`- **${partyBLabel}**`);
  const partyBSteps = normalizeSteps(data.nextSteps.partyB.steps, 2, notProvided);
  partyBSteps.forEach((step, index) => {
    lines.push(`  ${index + 1}. ${valueOrNotProvided(step, notProvided)}`);
  });

  return lines.join('\n');
};

const renderXml = (data: SummaryTemplateData, labels: ReturnType<typeof getSummaryTemplateLabels>): string => {
  const notProvided = labels.notProvided;
  const notFound = labels.notFound;
  const lines: string[] = [];

  lines.push(`<h3>1. ${labels.meetingHeader}</h3>`);
  lines.push('<ul>');
  lines.push(
    `<li><i>${labels.meetingTitle}</i> ${escapeXml(valueOrNotFound(data.meetingHeader.meetingTitle, notFound))}</li>`
  );
  lines.push(
    `<li><i>${labels.companiesParties}</i> ${escapeXml(
      valueOrNotFound(data.meetingHeader.companiesParties, notFound)
    )}</li>`
  );
  lines.push(`<li><i>${labels.date}</i> ${escapeXml(valueOrNotFound(data.meetingHeader.date, notFound))}</li>`);
  lines.push(
    `<li><i>${labels.duration}</i> ${escapeXml(valueOrNotFound(data.meetingHeader.duration, notFound))}</li>`
  );
  lines.push(
    `<li><i>${labels.linkReference}</i> ${escapeXml(
      valueOrNotFound(data.meetingHeader.linkReference, notFound)
    )}</li>`
  );
  lines.push('</ul>');

  lines.push(`<h3>2. ${labels.actionItems}</h3>`);
  lines.push(`<p><i>${labels.forEachAction}</i></p>`);

  const actionItems = data.actionItemsDetailed.length
    ? data.actionItemsDetailed
    : [{ action: '', owner: '', dueDate: '', notes: '' }];

  lines.push('<ul>');
  for (const item of actionItems) {
    lines.push(
      `<li><i>${labels.actionVerbObject}</i> ${escapeXml(valueOrNotProvided(item.action, notProvided))}`
    );
    lines.push('<ul>');
    lines.push(`<li><i>${labels.owner}</i> ${escapeXml(valueOrNotProvided(item.owner, notProvided))}</li>`);
    lines.push(`<li><i>${labels.dueDate}</i> ${escapeXml(valueOrNotProvided(item.dueDate, notProvided))}</li>`);
    lines.push(`<li><i>${labels.notesContext}</i> ${escapeXml(valueOrNotProvided(item.notes, notProvided))}</li>`);
    lines.push('</ul>');
    lines.push('</li>');
  }
  lines.push('</ul>');

  lines.push(`<h3>3. ${labels.meetingPurpose}</h3>`);
  lines.push(
    `<p><i>${labels.purposeOneSentence}</i> ${escapeXml(valueOrNotProvided(data.meetingPurpose, notProvided))}</p>`
  );

  lines.push(`<h3>4. ${labels.keyPoints}</h3>`);
  const keyPoints = data.keyPointsDetailed.length ? data.keyPointsDetailed : [{ title: '', explanation: '' }];
  lines.push('<ul>');
  for (const point of keyPoints) {
    lines.push(`<li><i>${labels.pointTitle}</i> ${escapeXml(valueOrNotProvided(point.title, notProvided))}`);
    lines.push(
      `<ul><li><i>${labels.pointExplanation}</i> ${escapeXml(
        valueOrNotProvided(point.explanation, notProvided)
      )}</li></ul>`
    );
    lines.push('</li>');
  }
  lines.push('</ul>');

  lines.push(`<h3>5. ${labels.topicsDetailed}</h3>`);
  const topics = data.topicsDetailed.length
    ? data.topicsDetailed
    : [{ topic: '', issueDescription: '', observations: [], rootCause: '', impact: '' }];

  lines.push('<ul>');
  for (const topic of topics) {
    lines.push(`<li><i>${labels.topic}</i> ${escapeXml(valueOrNotProvided(topic.topic, notProvided))}`);
    lines.push('<ul>');
    lines.push(
      `<li><i>${labels.issueDescription}</i> ${escapeXml(
        valueOrNotProvided(topic.issueDescription, notProvided)
      )}</li>`
    );
    lines.push(`<li><i>${labels.keyObservations}</i>`);
    lines.push('<ul>');
    const observations = topic.observations.length ? topic.observations : [notProvided];
    for (const obs of observations) {
      lines.push(`<li>${escapeXml(valueOrNotProvided(obs, notProvided))}</li>`);
    }
    lines.push('</ul>');
    lines.push('</li>');
    lines.push(`<li><i>${labels.rootCause}</i> ${escapeXml(valueOrNotProvided(topic.rootCause, notProvided))}</li>`);
    lines.push(`<li><i>${labels.impact}</i> ${escapeXml(valueOrNotProvided(topic.impact, notProvided))}</li>`);
    lines.push('</ul>');
    lines.push('</li>');
  }
  lines.push('</ul>');

  lines.push(`<h3>6. ${labels.pathForward}</h3>`);
  lines.push('<ul>');
  lines.push(
    `<li><i>${labels.definitionOfSuccess}</i> ${escapeXml(
      valueOrNotProvided(data.pathForward.definitionOfSuccess, notProvided)
    )}</li>`
  );
  lines.push(
    `<li><i>${labels.agreedNextAttempt}</i> ${escapeXml(
      valueOrNotProvided(data.pathForward.agreedNextAttempt, notProvided)
    )}</li>`
  );
  lines.push(
    `<li><i>${labels.decisionPoint}</i> ${escapeXml(
      valueOrNotProvided(data.pathForward.decisionPoint, notProvided)
    )}</li>`
  );
  lines.push(
    `<li><i>${labels.checkpointDate}</i> ${escapeXml(
      valueOrNotProvided(data.pathForward.checkpointDate, notProvided)
    )}</li>`
  );
  lines.push('</ul>');

  lines.push(`<h3>7. ${labels.nextSteps}</h3>`);
  const partyALabel = data.nextSteps.partyA.name ? `${labels.partyA} ${data.nextSteps.partyA.name}` : labels.partyA;
  lines.push(`<p><i>${escapeXml(partyALabel)}</i></p>`);
  const partyASteps = normalizeSteps(data.nextSteps.partyA.steps, 2, notProvided);
  lines.push('<ol>');
  partyASteps.forEach((step) => {
    lines.push(`<li>${escapeXml(valueOrNotProvided(step, notProvided))}</li>`);
  });
  lines.push('</ol>');

  const partyBLabel = data.nextSteps.partyB.name ? `${labels.partyB} ${data.nextSteps.partyB.name}` : labels.partyB;
  lines.push(`<p><i>${escapeXml(partyBLabel)}</i></p>`);
  const partyBSteps = normalizeSteps(data.nextSteps.partyB.steps, 2, notProvided);
  lines.push('<ol>');
  partyBSteps.forEach((step) => {
    lines.push(`<li>${escapeXml(valueOrNotProvided(step, notProvided))}</li>`);
  });
  lines.push('</ol>');

  return lines.join('\n');
};

const renderPlain = (data: SummaryTemplateData, labels: ReturnType<typeof getSummaryTemplateLabels>): string => {
  const notProvided = labels.notProvided;
  const notFound = labels.notFound;
  const lines: string[] = [];

  lines.push(`1) ${labels.meetingHeader}`);
  lines.push(`${labels.meetingTitle} ${valueOrNotFound(data.meetingHeader.meetingTitle, notFound)}`);
  lines.push(`${labels.companiesParties} ${valueOrNotFound(data.meetingHeader.companiesParties, notFound)}`);
  lines.push(`${labels.date} ${valueOrNotFound(data.meetingHeader.date, notFound)}`);
  lines.push(`${labels.duration} ${valueOrNotFound(data.meetingHeader.duration, notFound)}`);
  lines.push(`${labels.linkReference} ${valueOrNotFound(data.meetingHeader.linkReference, notFound)}`);
  lines.push('');

  lines.push(`2) ${labels.actionItems}`);
  lines.push(labels.forEachAction);
  const actionItems = data.actionItemsDetailed.length
    ? data.actionItemsDetailed
    : [{ action: '', owner: '', dueDate: '', notes: '' }];
  actionItems.forEach((item, index) => {
    lines.push(`Action Item ${index + 1}`);
    lines.push(`${labels.actionVerbObject} ${valueOrNotProvided(item.action, notProvided)}`);
    lines.push(`${labels.owner} ${valueOrNotProvided(item.owner, notProvided)}`);
    lines.push(`${labels.dueDate} ${valueOrNotProvided(item.dueDate, notProvided)}`);
    lines.push(`${labels.notesContext} ${valueOrNotProvided(item.notes, notProvided)}`);
  });
  lines.push('');

  lines.push(`3) ${labels.meetingPurpose}`);
  lines.push(`${labels.purposeOneSentence} ${valueOrNotProvided(data.meetingPurpose, notProvided)}`);
  lines.push('');

  lines.push(`4) ${labels.keyPoints}`);
  const keyPoints = data.keyPointsDetailed.length ? data.keyPointsDetailed : [{ title: '', explanation: '' }];
  keyPoints.forEach((point, index) => {
    lines.push(`Key Point ${index + 1}`);
    lines.push(`${labels.pointTitle} ${valueOrNotProvided(point.title, notProvided)}`);
    lines.push(`${labels.pointExplanation} ${valueOrNotProvided(point.explanation, notProvided)}`);
  });
  lines.push('');

  lines.push(`5) ${labels.topicsDetailed}`);
  const topics = data.topicsDetailed.length
    ? data.topicsDetailed
    : [{ topic: '', issueDescription: '', observations: [], rootCause: '', impact: '' }];
  topics.forEach((topic, index) => {
    lines.push(`Topic ${index + 1}`);
    lines.push(`${labels.topic} ${valueOrNotProvided(topic.topic, notProvided)}`);
    lines.push(`${labels.issueDescription} ${valueOrNotProvided(topic.issueDescription, notProvided)}`);
    lines.push(labels.keyObservations);
    const observations = topic.observations.length ? topic.observations : [notProvided];
    observations.forEach((obs, obsIndex) => {
      lines.push(`Observation ${obsIndex + 1}: ${valueOrNotProvided(obs, notProvided)}`);
    });
    lines.push(`${labels.rootCause} ${valueOrNotProvided(topic.rootCause, notProvided)}`);
    lines.push(`${labels.impact} ${valueOrNotProvided(topic.impact, notProvided)}`);
  });
  lines.push('');

  lines.push(`6) ${labels.pathForward}`);
  lines.push(`${labels.definitionOfSuccess} ${valueOrNotProvided(data.pathForward.definitionOfSuccess, notProvided)}`);
  lines.push(`${labels.agreedNextAttempt} ${valueOrNotProvided(data.pathForward.agreedNextAttempt, notProvided)}`);
  lines.push(`${labels.decisionPoint} ${valueOrNotProvided(data.pathForward.decisionPoint, notProvided)}`);
  lines.push(`${labels.checkpointDate} ${valueOrNotProvided(data.pathForward.checkpointDate, notProvided)}`);
  lines.push('');

  lines.push(`7) ${labels.nextSteps}`);
  const partyALabel = data.nextSteps.partyA.name ? `${labels.partyA} ${data.nextSteps.partyA.name}` : labels.partyA;
  lines.push(partyALabel);
  const partyASteps = normalizeSteps(data.nextSteps.partyA.steps, 2, notProvided);
  partyASteps.forEach((step, index) => {
    lines.push(`${labels.step} ${index + 1}: ${valueOrNotProvided(step, notProvided)}`);
  });
  lines.push('');

  const partyBLabel = data.nextSteps.partyB.name ? `${labels.partyB} ${data.nextSteps.partyB.name}` : labels.partyB;
  lines.push(partyBLabel);
  const partyBSteps = normalizeSteps(data.nextSteps.partyB.steps, 2, notProvided);
  partyBSteps.forEach((step, index) => {
    lines.push(`${labels.step} ${index + 1}: ${valueOrNotProvided(step, notProvided)}`);
  });

  return lines.join('\n');
};

export const renderSummaryTemplate = (
  result: SummaryResult,
  options?: { language?: SummaryTemplateLanguage; format?: SummaryTemplateFormat }
): string => {
  const labels = getSummaryTemplateLabels(options?.language);
  const data = buildTemplateData(result);
  const format = options?.format ?? 'xml';
  if (format === 'markdown') {
    return renderMarkdown(data, labels);
  }
  if (format === 'plain') {
    return renderPlain(data, labels);
  }
  return renderXml(data, labels);
};
