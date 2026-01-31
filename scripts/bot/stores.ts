import type { AgendaItem } from '../../src/agenda/types.js';
import type { ChannelRequest } from '../../src/teams/types.js';
import type { LanguageCode } from '../../src/teams/language.js';

export const languageStore = new Map<string, LanguageCode>();
export interface SelectionItem {
  index: number;
  title: string;
  details: string;
  agendaItem: AgendaItem;
}

export interface SelectionState {
  items: SelectionItem[];
  selectedIndex?: number;
}

export const selectionStore = new Map<string, SelectionState>();

export const getSelectedItem = (state?: SelectionState): SelectionItem | undefined => {
  if (!state?.selectedIndex) {
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
