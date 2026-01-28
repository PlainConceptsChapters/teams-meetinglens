import { describe, expect, it } from 'vitest';
import { extractLanguageToken, normalizeLanguage, resolveLanguage } from '../../src/teams/language.js';
import { ChannelRequest } from '../../src/teams/types.js';

const baseRequest: ChannelRequest = {
  channelId: 'msteams',
  conversationId: 'c1',
  messageId: 'm1',
  fromUserId: 'u1',
  text: 'hello'
};

describe('language helpers', () => {
  it('normalizes language codes', () => {
    expect(normalizeLanguage('en')).toBe('en');
    expect(normalizeLanguage('ES')).toBe('es');
    expect(normalizeLanguage('ro-RO')).toBe('ro');
    expect(normalizeLanguage('fr')).toBeUndefined();
  });

  it('extracts language tokens', () => {
    expect(extractLanguageToken('en summary')).toEqual({ language: 'en', remainder: 'summary' });
    expect(extractLanguageToken('lang:es hola')).toEqual({ language: 'es', remainder: 'hola' });
    expect(extractLanguageToken('question')).toEqual({ remainder: 'question' });
  });

  it('resolves language with preference fallback', () => {
    const store = new Map<string, 'en' | 'es' | 'ro'>();
    const explicit = resolveLanguage(baseRequest, 'es', store);
    expect(explicit).toBe('es');
    expect(store.get(baseRequest.conversationId)).toBe('es');

    const fromStore = resolveLanguage({ ...baseRequest, text: 'hola' }, undefined, store);
    expect(fromStore).toBe('es');

    const fromLocale = resolveLanguage({ ...baseRequest, conversationId: 'c2', locale: 'ro-RO' }, undefined, store);
    expect(fromLocale).toBe('ro');

    const fallback = resolveLanguage({ ...baseRequest, conversationId: 'c3' }, undefined, store);
    expect(fallback).toBe('en');
  });
});
