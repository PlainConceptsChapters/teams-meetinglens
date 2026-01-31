import { describe, expect, it, vi } from 'vitest';
import { handleAgendaRequest, formatRangeLabel } from '../../scripts/bot/agenda.js';
import type { ChannelRequest } from '../../src/teams/types.js';
import type { AgendaItem } from '../../src/agenda/types.js';

const baseRequest = (): ChannelRequest => ({
  channelId: 'msteams',
  conversationId: 'conv-1',
  messageId: 'msg-1',
  fromUserId: 'user-1',
  text: 'agenda yesterday'
});

describe('agenda progress', () => {
  it('emits progress updates while building agenda', async () => {
    const updates: { label: string; percent: number }[] = [];
    const request = baseRequest();
    request.progress = {
      update: async (update) => {
        updates.push(update);
      }
    };

    const agendaItem: AgendaItem = {
      eventId: 'evt-1',
      subject: 'Design Sync',
      start: new Date(Date.now() - 60_000).toISOString(),
      end: new Date(Date.now() - 30_000).toISOString(),
      transcriptAvailable: true
    };

    const response = await handleAgendaRequest({
      request,
      englishText: 'yesterday',
      preferred: 'en',
      t: (key) => key,
      translateOutgoing: async (text) => text,
      buildAgendaCard: () => ({ type: 'AdaptiveCard' }),
      selectionStore: new Map(),
      buildGraphServicesForRequest: () => ({
        agendaService: {
          searchAgenda: vi.fn().mockResolvedValue({ items: [agendaItem] })
        }
      }),
      formatRangeLabel,
      maxItems: 10
    });

    expect(response.text).toContain('agenda.intro');
    expect(updates.map((entry) => entry.percent)).toEqual([25, 60, 85]);
    expect(updates[0].label).toContain('progress.steps.searchCalendar');
    expect(updates[1].label).toContain('progress.steps.filterMeetings');
    expect(updates[2].label).toContain('progress.steps.buildAgenda');
  });
});