import { describe, expect, it } from 'vitest';
import { buildAgendaCard, buildSignInCard } from '../../scripts/bot/cards.js';

describe('bot cards', () => {
  it('builds agenda card with actions', () => {
    const card = buildAgendaCard('Agenda', [
      { index: 1, title: 'One', details: 'Details' },
      { index: 2, title: 'Two', details: 'More' }
    ]);

    expect(card.contentType).toBe('application/vnd.microsoft.card.adaptive');
    expect(card.content.body[0].text).toBe('Agenda');
    expect(card.content.actions).toHaveLength(2);
    expect(card.content.actions[0].data).toEqual({ command: 'select', selection: '1' });
  });

  it('builds sign-in card with link', () => {
    const card = buildSignInCard('Sign in', 'Go', 'https://example.com');
    expect(card.content.actions[0].url).toBe('https://example.com');
  });
});