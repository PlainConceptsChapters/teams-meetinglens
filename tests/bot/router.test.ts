import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRouter } from '../../scripts/bot/router.js';
import { selectionStore, languageStore } from '../../scripts/bot/stores.js';
import type { ChannelRequest } from '../../src/teams/types.js';
import type { AgendaItem } from '../../src/agenda/types.js';

const buildRouter = () =>
  createRouter({
    botMentionText: undefined,
    oauthConnection: undefined,
    graphAccessToken: undefined,
    systemTimeZone: 'UTC',
    agendaMaxItems: 10,
    selectionTtlMs: 60 * 60 * 1000,
    t: (key: string, vars?: Record<string, string>) =>
      vars ? Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, v), key) : key,
    translateOutgoing: async (text) => text,
    translateToEnglish: async (text) => text,
    resolvePreferredLanguage: async () => 'en',
    buildHelpText: () => 'help-text',
    buildSignInCard: () => ({}),
    buildAgendaCard: () => ({}),
    buildTranscript: async () => ({ raw: '', cues: [] }),
    buildGraphServicesForRequest: () => ({
      agendaService: { searchAgenda: vi.fn().mockResolvedValue({ items: [] }) },
      onlineMeetingService: {},
      transcriptService: {}
    }),
    getMeetingTranscriptService: () => ({ onlineMeetingService: {}, transcriptService: {} }),
    runGraphDebug: async () => ({ ok: true, count: 0 }),
    buildLlmClient: () => {
      throw new Error('no llm');
    },
    buildSummaryLlmClient: () => {
      throw new Error('no llm');
    }
  });

describe('bot router', () => {
  beforeEach(() => {
    selectionStore.clear();
    languageStore.clear();
  });

  it('handles help command', async () => {
    const router = buildRouter();
    const response = await router.handle({
      channelId: 'msteams',
      conversationId: 'conv',
      messageId: 'msg',
      fromUserId: 'user',
      text: '/help'
    } as ChannelRequest);
    expect(response.text).toBe('help-text');
  });

  it('handles version command', async () => {
    const router = buildRouter();
    const response = await router.handle({
      channelId: 'msteams',
      conversationId: 'conv',
      messageId: 'msg',
      fromUserId: 'user',
      text: '/version'
    } as ChannelRequest);
    expect(response.text).toContain('version.text');
  });

  it('falls back on unknown intent', async () => {
    const router = buildRouter();
    const response = await router.handle({
      channelId: 'msteams',
      conversationId: 'conv',
      messageId: 'msg',
      fromUserId: 'user',
      text: 'random'
    } as ChannelRequest);
    expect(response.text).toBe('fallback.unknown');
  });

  it('selects a meeting from stored agenda', async () => {
    const router = buildRouter();
    selectionStore.set('conv', {
      items: [
        {
          index: 1,
          title: 'Meeting',
          details: 'Details',
          agendaItem: { eventId: '1' } as AgendaItem
        }
      ]
    });
    const response = await router.handle({
      channelId: 'msteams',
      conversationId: 'conv',
      messageId: 'msg',
      fromUserId: 'user',
      text: '/select 1'
    } as ChannelRequest);
    expect(response.text).toContain('selection.selected');
  });
});
