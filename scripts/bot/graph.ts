import type { ChannelRequest } from '../../src/teams/types.js';
import { AgendaService } from '../../src/agenda/agendaService.js';
import { CalendarService } from '../../src/graph/calendarService.js';
import { GraphClient } from '../../src/graph/graphClient.js';
import { OnlineMeetingService } from '../../src/graph/onlineMeetingService.js';
import { TranscriptService } from '../../src/transcripts/transcriptService.js';
import { logEvent } from './logging.js';

export const getGraphTokenForRequest = async (request: ChannelRequest, graphAccessToken?: string): Promise<string> => {
  if (graphAccessToken) {
    return graphAccessToken;
  }
  if (request.graphToken) {
    return request.graphToken;
  }
  throw new Error('Missing Graph token for this user.');
};

export const buildGraphServicesForRequest = (request: ChannelRequest, graphBaseUrl: string, graphAccessToken?: string) => {
  const graphClient = new GraphClient({
    baseUrl: graphBaseUrl,
    tokenProvider: () => getGraphTokenForRequest(request, graphAccessToken)
  });
  const calendarService = new CalendarService({ graphClient });
  const onlineMeetingService = new OnlineMeetingService({ graphClient });
  const transcriptService = new TranscriptService({ graphClient });
  const agendaService = new AgendaService({
    calendarService,
    onlineMeetingService,
    transcriptService
  });
  return { agendaService, onlineMeetingService, transcriptService };
};

export const getMeetingTranscriptService = (request: ChannelRequest, graphBaseUrl: string, graphAccessToken?: string) => {
  const { onlineMeetingService, transcriptService } = buildGraphServicesForRequest(request, graphBaseUrl, graphAccessToken);
  return { onlineMeetingService, transcriptService };
};

export const runGraphDebug = async (request: ChannelRequest, graphBaseUrl: string, graphAccessToken?: string) => {
  const graphClient = new GraphClient({
    baseUrl: graphBaseUrl,
    tokenProvider: () => getGraphTokenForRequest(request, graphAccessToken)
  });
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 7);
  const end = new Date(now);
  end.setDate(end.getDate() + 1);
  try {
    await graphClient.get('/me', undefined);
    logEvent(request, 'graph_call', { endpoint: '/me', status: 'ok' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    logEvent(request, 'graph_call', { endpoint: '/me', status: 'error', message });
    return { ok: false, error: message };
  }
  try {
    const { agendaService } = buildGraphServicesForRequest(request, graphBaseUrl, graphAccessToken);
    const agenda = await agendaService.searchAgenda({
      startDateTime: start.toISOString(),
      endDateTime: end.toISOString(),
      includeTranscriptAvailability: true,
      top: 10
    });
    logEvent(request, 'graph_call', { endpoint: '/me/calendarView', status: 'ok', count: agenda.items.length });
    const count = agenda.items.length;
    const withJoinUrl = agenda.items.filter((item) => Boolean(item.joinUrl)).length;
    const withTranscript = agenda.items.filter((item) => item.transcriptAvailable).length;
    return { ok: true, count, start, end, withJoinUrl, withTranscript };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    logEvent(request, 'graph_call', { endpoint: '/me/calendarView', status: 'error', message });
    return { ok: false, error: message };
  }
};
