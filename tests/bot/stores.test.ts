import { describe, expect, it } from 'vitest';
import { getSelectedItem, isSelectionExpired, SelectionState } from '../../scripts/bot/stores.js';

const now = 1700000000000;

const buildState = (selectedAt: number): SelectionState => ({
  items: [{ index: 1, title: 'Meeting', details: '', agendaItem: { eventId: '1' } }],
  selectedIndex: 1,
  selectedAt
});

describe('selection ttl', () => {
  it('returns selected item when within ttl', () => {
    const state = buildState(now - 1000);
    const selected = getSelectedItem(state, now, 60_000);
    expect(selected?.title).toBe('Meeting');
  });

  it('returns undefined when expired', () => {
    const state = buildState(now - 120_000);
    const selected = getSelectedItem(state, now, 60_000);
    expect(selected).toBeUndefined();
    expect(isSelectionExpired(state, now, 60_000)).toBe(true);
  });
});
