import { InvalidRequestError } from '../errors/index.js';

export interface SummaryResult {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  decisions: string[];
  topics: string[];
  templateData?: SummaryTemplateData;
  template?: string;
  templateFormat?: 'markdown' | 'xml';
}

export interface QaResult {
  answer: string;
  citations: string[];
}

export interface MeetingHeader {
  meetingTitle: string;
  companiesParties: string;
  date: string;
  duration: string;
  linkReference: string;
}

export interface SummaryActionItem {
  action: string;
  owner: string;
  dueDate: string;
  notes: string;
}

export interface SummaryKeyPoint {
  title: string;
  explanation: string;
}

export interface SummaryTopic {
  topic: string;
  issueDescription: string;
  observations: string[];
  rootCause: string;
  impact: string;
}

export interface SummaryPathForward {
  definitionOfSuccess: string;
  agreedNextAttempt: string;
  decisionPoint: string;
  checkpointDate: string;
}

export interface SummaryPartySteps {
  name: string;
  steps: string[];
}

export interface SummaryNextSteps {
  partyA: SummaryPartySteps;
  partyB: SummaryPartySteps;
}

export interface SummaryTemplateData {
  meetingHeader: MeetingHeader;
  actionItemsDetailed: SummaryActionItem[];
  meetingPurpose: string;
  keyPointsDetailed: SummaryKeyPoint[];
  topicsDetailed: SummaryTopic[];
  pathForward: SummaryPathForward;
  nextSteps: SummaryNextSteps;
}

const ensureArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item) => typeof item === 'string');
};

const ensureString = (value: unknown): string => {
  return typeof value === 'string' ? value : '';
};

const ensureObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object') {
    return {};
  }
  return value as Record<string, unknown>;
};

const parseMeetingHeader = (value: unknown): MeetingHeader => {
  const obj = ensureObject(value);
  return {
    meetingTitle: ensureString(obj.meetingTitle),
    companiesParties: ensureString(obj.companiesParties),
    date: ensureString(obj.date),
    duration: ensureString(obj.duration),
    linkReference: ensureString(obj.linkReference)
  };
};

const parseActionItemsDetailed = (value: unknown): SummaryActionItem[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const obj = ensureObject(item);
    return {
      action: ensureString(obj.action),
      owner: ensureString(obj.owner),
      dueDate: ensureString(obj.dueDate),
      notes: ensureString(obj.notes)
    };
  });
};

const parseKeyPointsDetailed = (value: unknown): SummaryKeyPoint[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const obj = ensureObject(item);
    return {
      title: ensureString(obj.title),
      explanation: ensureString(obj.explanation)
    };
  });
};

const parseTopicsDetailed = (value: unknown): SummaryTopic[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const obj = ensureObject(item);
    return {
      topic: ensureString(obj.topic),
      issueDescription: ensureString(obj.issueDescription),
      observations: ensureArray(obj.observations),
      rootCause: ensureString(obj.rootCause),
      impact: ensureString(obj.impact)
    };
  });
};

const parsePathForward = (value: unknown): SummaryPathForward => {
  const obj = ensureObject(value);
  return {
    definitionOfSuccess: ensureString(obj.definitionOfSuccess),
    agreedNextAttempt: ensureString(obj.agreedNextAttempt),
    decisionPoint: ensureString(obj.decisionPoint),
    checkpointDate: ensureString(obj.checkpointDate)
  };
};

const parsePartySteps = (value: unknown): SummaryPartySteps => {
  const obj = ensureObject(value);
  return {
    name: ensureString(obj.name),
    steps: ensureArray(obj.steps)
  };
};

const parseNextSteps = (value: unknown): SummaryNextSteps => {
  const obj = ensureObject(value);
  return {
    partyA: parsePartySteps(obj.partyA),
    partyB: parsePartySteps(obj.partyB)
  };
};

const parseTemplateData = (value: unknown): SummaryTemplateData | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const obj = value as Record<string, unknown>;
  return {
    meetingHeader: parseMeetingHeader(obj.meetingHeader),
    actionItemsDetailed: parseActionItemsDetailed(obj.actionItemsDetailed),
    meetingPurpose: ensureString(obj.meetingPurpose),
    keyPointsDetailed: parseKeyPointsDetailed(obj.keyPointsDetailed),
    topicsDetailed: parseTopicsDetailed(obj.topicsDetailed),
    pathForward: parsePathForward(obj.pathForward),
    nextSteps: parseNextSteps(obj.nextSteps)
  };
};

const extractJsonObject = (input: string): string | undefined => {
  const text = input.trim();
  if (!text) {
    return undefined;
  }
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      if (depth === 0) {
        start = i;
      }
      depth += 1;
      continue;
    }
    if (char === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return undefined;
};

const parseJsonPayload = (raw: string, errorMessage: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    const extracted = extractJsonObject(raw);
    if (!extracted) {
      throw new InvalidRequestError(errorMessage);
    }
    try {
      return JSON.parse(extracted);
    } catch {
      throw new InvalidRequestError(errorMessage);
    }
  }
};

export const parseSummaryResult = (raw: string): SummaryResult => {
  const data = parseJsonPayload(raw, 'Summary response is not valid JSON.');
  if (!data || typeof data !== 'object') {
    throw new InvalidRequestError('Summary response is not an object.');
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj.summary !== 'string') {
    throw new InvalidRequestError('Summary response missing summary.');
  }
  return {
    summary: obj.summary,
    keyPoints: ensureArray(obj.keyPoints),
    actionItems: ensureArray(obj.actionItems),
    decisions: ensureArray(obj.decisions),
    topics: ensureArray(obj.topics),
    templateData: parseTemplateData(obj.templateData)
  };
};

export const parseQaResult = (raw: string): QaResult => {
  const data = parseJsonPayload(raw, 'Q&A response is not valid JSON.');
  if (!data || typeof data !== 'object') {
    throw new InvalidRequestError('Q&A response is not an object.');
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj.answer !== 'string') {
    throw new InvalidRequestError('Q&A response missing answer.');
  }
  return {
    answer: obj.answer,
    citations: ensureArray(obj.citations)
  };
};
