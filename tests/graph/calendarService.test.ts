import { describe, expect, it } from 'vitest';
import { CalendarService } from '../../src/graph/calendarService.js';
import { GraphClient } from '../../src/graph/graphClient.js';

const createGraphClient = () => {
  let lastPath = '';
  let lastQuery: Record<string, string> | undefined;

  const fetcher: typeof fetch = async (input) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    );
    const path = url.pathname.startsWith('/v1.0') ? url.pathname.slice('/v1.0'.length) : url.pathname;
    lastPath = path;
    lastQuery = Object.fromEntries(url.searchParams.entries());
    return new Response(JSON.stringify({ value: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  const client = new GraphClient({
    tokenProvider: async () => 'token',
    fetcher
  });

  return { client, getLast: () => ({ lastPath, lastQuery }) };
};

describe('CalendarService', () => {
  it('builds calendar view query', async () => {
    const { client, getLast } = createGraphClient();
    const service = new CalendarService({ graphClient: client });

    await service.listCalendarView({
      startDateTime: '2024-01-01T00:00:00Z',
      endDateTime: '2024-01-02T00:00:00Z',
      subjectContains: 'sync',
      organizerEmail: 'owner@example.com'
    });

    const { lastPath, lastQuery } = getLast();
    expect(lastPath).toBe('/me/calendarView');
    expect(lastQuery?.startDateTime).toBe('2024-01-01T00:00:00Z');
    expect(lastQuery?.['$filter']).toContain("contains(subject,'sync')");
  });
});
