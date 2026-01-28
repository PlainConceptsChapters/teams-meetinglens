import { describe, expect, it } from 'vitest';
import { buildQaSystemPrompt, buildSummarySystemPrompt } from '../../src/llm/promptTemplates.js';

describe('promptTemplates language', () => {
  it('builds summary prompt in English by default', () => {
    const prompt = buildSummarySystemPrompt();
    expect(prompt).toContain('Respond in English.');
  });

  it('builds summary prompt in Spanish', () => {
    const prompt = buildSummarySystemPrompt('es');
    expect(prompt).toContain('Respond in Spanish.');
  });

  it('builds QA prompt with localized fallback', () => {
    const prompt = buildQaSystemPrompt('ro');
    expect(prompt).toContain('Respond in Romanian.');
  });
});
