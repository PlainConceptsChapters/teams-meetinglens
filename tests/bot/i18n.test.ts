import { describe, expect, it } from 'vitest';
import { createI18n } from '../../scripts/bot/i18n.js';
import type { ChannelRequest } from '../../src/teams/types.js';

const createRequest = (overrides: Partial<ChannelRequest> = {}): ChannelRequest => ({
  channelId: 'msteams',
  conversationId: 'conv-1',
  messageId: 'msg-1',
  fromUserId: 'user-1',
  text: 'hello',
  ...overrides
});

const stubClient = () => ({
  complete: async () => 'ok'
});

describe('language auto-detection', () => {
  it('defaults to English for unsupported locales', async () => {
    const { resolvePreferredLanguage } = createI18n({}, stubClient);
    const request = createRequest({ locale: 'fr-FR', text: 'bonjour' });
    const lang = await resolvePreferredLanguage(request);
    expect(lang).toBe('en');
  });

  it('accepts Spanish locale for auto-detection', async () => {
    const { resolvePreferredLanguage } = createI18n({}, stubClient);
    const request = createRequest({ locale: 'es-ES', text: 'hola!' });
    const lang = await resolvePreferredLanguage(request);
    expect(lang).toBe('es');
  });
});
