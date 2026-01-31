import { describe, expect, it } from 'vitest';
import { parseQaResult, parseSummaryResult } from '../../src/llm/schema.js';

const SUMMARY = JSON.stringify({
  summary: 'Done',
  keyPoints: ['a'],
  actionItems: ['b'],
  decisions: [],
  topics: ['topic'],
  templateData: {
    meetingHeader: {
      meetingTitle: 'Weekly Sync',
      companiesParties: 'Contoso / Fabrikam',
      date: '2025-01-10',
      duration: '30m',
      linkReference: ''
    },
    actionItemsDetailed: [{ action: 'Send notes', owner: 'Alex', dueDate: '', notes: '' }],
    meetingPurpose: 'Align on deliverables.',
    keyPointsDetailed: [{ title: 'Timeline', explanation: 'Moved by one week.' }],
    topicsDetailed: [
      {
        topic: 'Budget',
        issueDescription: 'Overrun risk',
        observations: ['Costs rising'],
        rootCause: 'Scope changes',
        impact: 'Potential delay'
      }
    ],
    pathForward: {
      definitionOfSuccess: 'Deliver v1',
      agreedNextAttempt: 'Prototype',
      decisionPoint: 'Go/no-go',
      checkpointDate: '2025-01-20'
    },
    nextSteps: { partyA: { name: 'Team A', steps: ['Draft plan'] }, partyB: { name: '', steps: [] } }
  }
});

const QA = JSON.stringify({ answer: 'Yes', citations: ['00:00:01'] });
const SUMMARY_WITH_PREAMBLE = `Here is the JSON:\n\`\`\`json\n${SUMMARY}\n\`\`\``;
const QA_WITH_PREAMBLE = `Answer:\n${QA}\nThanks.`;

describe('schema parsers', () => {
  it('parses summary schema', () => {
    const parsed = parseSummaryResult(SUMMARY);
    expect(parsed.summary).toBe('Done');
    expect(parsed.keyPoints).toEqual(['a']);
    expect(parsed.templateData?.meetingHeader.meetingTitle).toBe('Weekly Sync');
    expect(parsed.templateData?.actionItemsDetailed[0].action).toBe('Send notes');
    expect(parsed.templateData?.topicsDetailed[0].topic).toBe('Budget');
  });

  it('parses qa schema', () => {
    const parsed = parseQaResult(QA);
    expect(parsed.answer).toBe('Yes');
    expect(parsed.citations).toEqual(['00:00:01']);
  });

  it('parses summary schema from wrapped output', () => {
    const parsed = parseSummaryResult(SUMMARY_WITH_PREAMBLE);
    expect(parsed.summary).toBe('Done');
  });

  it('parses qa schema from wrapped output', () => {
    const parsed = parseQaResult(QA_WITH_PREAMBLE);
    expect(parsed.answer).toBe('Yes');
  });
});
