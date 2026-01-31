import type { AgendaItem } from '../../src/agenda/types.js';
import type { ChannelRequest } from '../../src/teams/types.js';
import type { LanguageCode } from '../../src/teams/language.js';

export interface LanguagePreference {
  code: LanguageCode;
  source: 'explicit' | 'auto';
}

export const languageStore = new Map<string, LanguagePreference>();
export interface SelectionItem {
  index: number;
  title: string;
  details: string;
  agendaItem: AgendaItem;
}

export interface SelectionState {
  items: SelectionItem[];
  selectedIndex?: number;
  selectedAt?: number;
}

export const selectionStore = new Map<string, SelectionState>();

export const isSelectionExpired = (state: SelectionState | undefined, now: number, ttlMs: number): boolean => {
  if (!state?.selectedAt) {
    return false;
  }
  return now - state.selectedAt > ttlMs;
};

export const getSelectedItem = (
  state: SelectionState | undefined,
  now: number,
  ttlMs: number
): SelectionItem | undefined => {
  if (!state?.selectedIndex) {
    return undefined;
  }
  if (isSelectionExpired(state, now, ttlMs)) {
    return undefined;
  }
  const index = state.selectedIndex - 1;
  if (index < 0 || index >= state.items.length) {
    return undefined;
  }
  return state.items[index];
};

export const getLanguageKey = (request: Pick<ChannelRequest, 'conversationId' | 'fromUserId'>) => {
  const user = request.fromUserId || 'anonymous';
  return `${request.conversationId}:${user}`;
};
