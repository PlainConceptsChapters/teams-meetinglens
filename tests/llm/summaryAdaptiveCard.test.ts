import { describe, expect, it } from 'vitest';
import { buildSummaryAdaptiveCard } from '../../src/llm/summaryAdaptiveCard.js';
import { SummaryResult } from '../../src/llm/schema.js';

const baseResult: SummaryResult = {
  summary: 'Align on scope.',
  keyPoints: ['Timeline updated'],
  actionItems: ['Share revised plan'],
  decisions: [],
  topics: ['Timeline'],
  templateData: {
    meetingHeader: {
      meetingTitle: 'Weekly Sync',
      companiesParties: 'Contoso / Fabrikam',
      date: '2025-01-10',
      duration: '30m',
      linkReference: 'https://example.com'
    },
    actionItemsDetailed: [{ action: 'Share revised plan', owner: 'Alicia', dueDate: '2025-01-12', notes: '' }],
    meetingPurpose: 'Align on scope.',
    keyPointsDetailed: [{ title: 'Timeline updated', explanation: 'Shifted by one week.' }],
    topicsDetailed: [
      {
        topic: 'Timeline',
        issueDescription: 'Delay risk',
        observations: ['Vendor lead time'],
        rootCause: 'Dependency lag',
        impact: 'Potential slip'
      }
    ],
    pathForward: {
      definitionOfSuccess: 'On-time delivery',
      agreedNextAttempt: 'Update plan',
      decisionPoint: 'Go/no-go',
      checkpointDate: '2025-01-20'
    },
    nextSteps: { partyA: { name: 'Team A', steps: ['Update schedule'] }, partyB: { name: '', steps: [] } }
  }
};

describe('buildSummaryAdaptiveCard', () => {
  it('returns an adaptive card payload', () => {
    const card = buildSummaryAdaptiveCard(baseResult, { language: 'en' });
    expect(card.contentType).toBe('application/vnd.microsoft.card.adaptive');
    expect(card.content.type).toBe('AdaptiveCard');
    expect(card.content.body[0].text).toContain('1. Meeting Header');
  });
});
