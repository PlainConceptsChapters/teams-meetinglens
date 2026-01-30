import type { AgendaItem } from '../../src/agenda/types.js';
import type { ChannelRequest } from '../../src/teams/types.js';
import type { LanguageCode } from '../../src/teams/language.js';

export const languageStore = new Map<string, LanguageCode>();
export const selectionStore = new Map<
  string,
  { items: { index: number; title: string; details: string; agendaItem: AgendaItem }[] }
>();

export const getLanguageKey = (request: Pick<ChannelRequest, 'conversationId' | 'fromUserId'>) => {
  const user = request.fromUserId || 'anonymous';
  return `${request.conversationId}:${user}`;
};
