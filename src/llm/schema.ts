import { InvalidRequestError } from '../errors/index.js';

export interface SummaryResult {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  decisions: string[];
  topics: string[];
}

export interface QaResult {
  answer: string;
  citations: string[];
}

const ensureArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item) => typeof item === 'string');
};

export const parseSummaryResult = (raw: string): SummaryResult => {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new InvalidRequestError('Summary response is not valid JSON.');
  }
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
    topics: ensureArray(obj.topics)
  };
};

export const parseQaResult = (raw: string): QaResult => {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new InvalidRequestError('Q&A response is not valid JSON.');
  }
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
