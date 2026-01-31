import { describe, expect, it } from 'vitest';
import { renderSummaryTemplate } from '../../src/llm/summaryTemplate.js';
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

describe('renderSummaryTemplate', () => {
  it('renders the template with required sections', () => {
    const output = renderSummaryTemplate(baseResult, { language: 'en' });
    expect(output).toContain('<h3>1. Meeting Header</h3>');
    expect(output).toContain('<h3>2. Action Items</h3>');
    expect(output).toContain('<h3>3. Meeting Purpose</h3>');
    expect(output).toContain('<h3>4. Key Points</h3>');
    expect(output).toContain('<h3>5. Topics (detailed discussion)</h3>');
    expect(output).toContain('<h3>6. Path Forward and Success Metrics</h3>');
    expect(output).toContain('<h3>7. Next Steps</h3>');
  });

  it('falls back to Not provided for missing fields', () => {
    const minimal: SummaryResult = {
      summary: '',
      keyPoints: [],
      actionItems: [],
      decisions: [],
      topics: []
    };
    const output = renderSummaryTemplate(minimal, { language: 'en' });
    expect(output).toContain('None');
  });
});
