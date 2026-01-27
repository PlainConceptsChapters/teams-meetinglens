import { describe, expect, it } from 'vitest';
import { MeetingResolver } from '../../src/graph/meetingResolver.js';

const createCalendarService = (event = { id: '1', subject: 'Daily', onlineMeeting: { joinUrl: 'https://join' } }) => {
  return {
    getEventById: async () => event,
    listCalendarView: async () => [event]
  };
};

describe('MeetingResolver', () => {
  it('resolves by event id when provided', async () => {
    const resolver = new MeetingResolver({ calendarService: createCalendarService() as any });
    const result = await resolver.resolveMeeting({ eventId: '1' });
    expect(result.calendarEventId).toBe('1');
  });

  it('resolves by joinUrl when searching', async () => {
    const resolver = new MeetingResolver({ calendarService: createCalendarService() as any });
    const result = await resolver.resolveMeeting({
      joinUrl: 'https://join',
      startDateTime: '2024-01-01T00:00:00Z',
      endDateTime: '2024-01-02T00:00:00Z'
    });
    expect(result.joinUrl).toBe('https://join');
  });
});
