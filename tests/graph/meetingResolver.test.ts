import { describe, expect, it } from 'vitest';
import { CalendarService } from '../../src/graph/calendarService.js';
import { GraphClient } from '../../src/graph/graphClient.js';
import { MeetingResolver } from '../../src/graph/meetingResolver.js';

const createCalendarService = (event = { id: '1', subject: 'Daily', onlineMeeting: { joinUrl: 'https://join' } }) => {
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    );
    const path = url.pathname;
    if (path.startsWith('/v1.0/me/events/')) {
      return new Response(JSON.stringify(event), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (path === '/v1.0/me/calendarView') {
      return new Response(JSON.stringify({ value: [event] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ value: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  const client = new GraphClient({
    tokenProvider: async () => 'token',
    fetcher
  });

  return new CalendarService({ graphClient: client });
};

describe('MeetingResolver', () => {
  it('resolves by event id when provided', async () => {
    const resolver = new MeetingResolver({ calendarService: createCalendarService() });
    const result = await resolver.resolveMeeting({ eventId: '1' });
    expect(result.calendarEventId).toBe('1');
  });

  it('resolves by joinUrl when searching', async () => {
    const resolver = new MeetingResolver({ calendarService: createCalendarService() });
    const result = await resolver.resolveMeeting({
      joinUrl: 'https://join',
      startDateTime: '2024-01-01T00:00:00Z',
      endDateTime: '2024-01-02T00:00:00Z'
    });
    expect(result.joinUrl).toBe('https://join');
  });
});
