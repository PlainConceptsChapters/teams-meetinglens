import { describe, expect, it, vi } from 'vitest';

describe('bot config', () => {
  it('requireEnv throws when missing', async () => {
    vi.resetModules();
    delete process.env.TEST_REQUIRED;
    const { requireEnv } = await import('../../scripts/bot/config.js');
    expect(() => requireEnv('TEST_REQUIRED')).toThrowError(/Missing TEST_REQUIRED/);
  });

  it('parses numeric env values with defaults', async () => {
    vi.resetModules();
    process.env.AGENDA_MAX_ITEMS = '12';
    process.env.AGENDA_MAX_TRANSCRIPT_CHECKS = '3';
    process.env.CALENDAR_MAX_PAGES = '0';
    process.env.SELECTION_TTL_MINUTES = '2';
    process.env.SUMMARY_MAX_TOKENS_PER_CHUNK = '2000';
    process.env.SUMMARY_OVERLAP_TOKENS = '100';
    process.env.SUMMARY_MAX_CHUNKS = '4';
    process.env.SUMMARY_PARALLELISM = '5';
    process.env.SUMMARY_MAX_PARALLELISM = '3';
    const config = await import('../../scripts/bot/config.js');
    expect(config.agendaMaxItems).toBe(12);
    expect(config.agendaMaxTranscriptChecks).toBe(12);
    expect(config.calendarMaxPages).toBe(3);
    expect(config.selectionTtlMs).toBe(2 * 60 * 1000);
    expect(config.summaryOptions.maxTokensPerChunk).toBe(2000);
    expect(config.summaryOptions.overlapTokens).toBe(100);
    expect(config.summaryOptions.maxChunks).toBe(4);
    expect(config.summaryOptions.parallelism).toBe(3);
  });
});
