import { describe, expect, it } from 'vitest';
import { CalendarService } from '../../src/graph/calendarService.js';

const createGraphClient = () => {
  let lastPath = '';
  let lastQuery: Record<string, string> | undefined;

  return {
    client: {
      get: async (_path: string, _query?: Record<string, string>) => {
        lastPath = _path;
        lastQuery = _query;
        return { value: [] } as { value: [] };
      }
    },
    getLast: () => ({ lastPath, lastQuery })
  };
};

describe('CalendarService', () => {
  it('builds calendar view query', async () => {
    const { client, getLast } = createGraphClient();
    const service = new CalendarService({ graphClient: client as any });

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
