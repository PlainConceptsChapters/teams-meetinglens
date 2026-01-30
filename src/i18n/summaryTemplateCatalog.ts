import { getI18nCatalog } from './catalog.js';

export interface TemplateLabels {
  summaryTitle: string;
  decisions: string;
  meetingHeader: string;
  meetingTitle: string;
  companiesParties: string;
  date: string;
  duration: string;
  linkReference: string;
  actionItems: string;
  forEachAction: string;
  actionVerbObject: string;
  owner: string;
  dueDate: string;
  notesContext: string;
  meetingPurpose: string;
  purposeOneSentence: string;
  keyPoints: string;
  shortListEachPoint: string;
  pointTitle: string;
  pointExplanation: string;
  topicsDetailed: string;
  topic: string;
  issueDescription: string;
  keyObservations: string;
  rootCause: string;
  impact: string;
  pathForward: string;
  definitionOfSuccess: string;
  agreedNextAttempt: string;
  decisionPoint: string;
  checkpointDate: string;
  nextSteps: string;
  partyA: string;
  partyB: string;
  step: string;
  notProvided: string;
}

const getSection = (catalog: Record<string, unknown>): Record<string, unknown> => {
  const value = catalog.summaryTemplate;
  if (value && typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  return {};
};

const getLabel = (section: Record<string, unknown>, fallback: Record<string, unknown>, key: keyof TemplateLabels): string => {
  const value = section[key];
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  const fallbackValue = fallback[key];
  if (typeof fallbackValue === 'string' && fallbackValue.trim()) {
    return fallbackValue;
  }
  return '';
};

export const getSummaryTemplateLabels = (language?: string): TemplateLabels => {
  const fallbackCatalog = getI18nCatalog('en');
  const fallbackSection = getSection(fallbackCatalog);
  const targetCatalog = language ? getI18nCatalog(language) : fallbackCatalog;
  const targetSection = getSection(targetCatalog);

  return {
    summaryTitle: getLabel(targetSection, fallbackSection, 'summaryTitle'),
    decisions: getLabel(targetSection, fallbackSection, 'decisions'),
    meetingHeader: getLabel(targetSection, fallbackSection, 'meetingHeader'),
    meetingTitle: getLabel(targetSection, fallbackSection, 'meetingTitle'),
    companiesParties: getLabel(targetSection, fallbackSection, 'companiesParties'),
    date: getLabel(targetSection, fallbackSection, 'date'),
    duration: getLabel(targetSection, fallbackSection, 'duration'),
    linkReference: getLabel(targetSection, fallbackSection, 'linkReference'),
    actionItems: getLabel(targetSection, fallbackSection, 'actionItems'),
    forEachAction: getLabel(targetSection, fallbackSection, 'forEachAction'),
    actionVerbObject: getLabel(targetSection, fallbackSection, 'actionVerbObject'),
    owner: getLabel(targetSection, fallbackSection, 'owner'),
    dueDate: getLabel(targetSection, fallbackSection, 'dueDate'),
    notesContext: getLabel(targetSection, fallbackSection, 'notesContext'),
    meetingPurpose: getLabel(targetSection, fallbackSection, 'meetingPurpose'),
    purposeOneSentence: getLabel(targetSection, fallbackSection, 'purposeOneSentence'),
    keyPoints: getLabel(targetSection, fallbackSection, 'keyPoints'),
    shortListEachPoint: getLabel(targetSection, fallbackSection, 'shortListEachPoint'),
    pointTitle: getLabel(targetSection, fallbackSection, 'pointTitle'),
    pointExplanation: getLabel(targetSection, fallbackSection, 'pointExplanation'),
    topicsDetailed: getLabel(targetSection, fallbackSection, 'topicsDetailed'),
    topic: getLabel(targetSection, fallbackSection, 'topic'),
    issueDescription: getLabel(targetSection, fallbackSection, 'issueDescription'),
    keyObservations: getLabel(targetSection, fallbackSection, 'keyObservations'),
    rootCause: getLabel(targetSection, fallbackSection, 'rootCause'),
    impact: getLabel(targetSection, fallbackSection, 'impact'),
    pathForward: getLabel(targetSection, fallbackSection, 'pathForward'),
    definitionOfSuccess: getLabel(targetSection, fallbackSection, 'definitionOfSuccess'),
    agreedNextAttempt: getLabel(targetSection, fallbackSection, 'agreedNextAttempt'),
    decisionPoint: getLabel(targetSection, fallbackSection, 'decisionPoint'),
    checkpointDate: getLabel(targetSection, fallbackSection, 'checkpointDate'),
    nextSteps: getLabel(targetSection, fallbackSection, 'nextSteps'),
    partyA: getLabel(targetSection, fallbackSection, 'partyA'),
    partyB: getLabel(targetSection, fallbackSection, 'partyB'),
    step: getLabel(targetSection, fallbackSection, 'step'),
    notProvided: getLabel(targetSection, fallbackSection, 'notProvided')
  };
};
