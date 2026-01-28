import { describe, expect, it } from 'vitest';
import { parseQaResult, parseSummaryResult } from '../../src/llm/schema.js';

const SUMMARY = JSON.stringify({
  summary: 'Done',
  keyPoints: ['a'],
  actionItems: ['b'],
  decisions: [],
  topics: ['topic']
});

const QA = JSON.stringify({ answer: 'Yes', citations: ['00:00:01'] });

describe('schema parsers', () => {
  it('parses summary schema', () => {
    const parsed = parseSummaryResult(SUMMARY);
    expect(parsed.summary).toBe('Done');
    expect(parsed.keyPoints).toEqual(['a']);
  });

  it('parses qa schema', () => {
    const parsed = parseQaResult(QA);
    expect(parsed.answer).toBe('Yes');
    expect(parsed.citations).toEqual(['00:00:01']);
  });
});
