import { describe, expect, it } from 'vitest';
import { MeetingTranscriptService } from '../../src/agenda/meetingTranscriptService.js';
import { NotFoundError } from '../../src/errors/index.js';
import { OnlineMeetingService } from '../../src/graph/onlineMeetingService.js';
import { TranscriptService } from '../../src/transcripts/transcriptService.js';

const createOnlineMeetingService = (map: Record<string, string | undefined>) =>
  ({
    findOnlineMeetingIdByJoinUrl: async (joinUrl: string) => map[joinUrl]
  }) as unknown as OnlineMeetingService;

const createTranscriptService = () =>
  ({
    getLatestTranscript: async () => ({ id: 't1' }),
    getTranscriptContent: async () => ({ raw: 'hello', cues: [] })
  }) as unknown as TranscriptService;

describe('MeetingTranscriptService', () => {
  it('resolves transcript via joinUrl', async () => {
    const service = new MeetingTranscriptService({
      onlineMeetingService: createOnlineMeetingService({ 'https://join/1': 'm1' }),
      transcriptService: createTranscriptService()
    });

    const content = await service.getTranscriptForAgendaItem({ eventId: '1', joinUrl: 'https://join/1' });
    expect(content.raw).toBe('hello');
  });

  it('throws when no online meeting id is available', async () => {
    const service = new MeetingTranscriptService({
      onlineMeetingService: createOnlineMeetingService({}),
      transcriptService: createTranscriptService()
    });

    await expect(service.getTranscriptForAgendaItem({ eventId: '1' })).rejects.toBeInstanceOf(NotFoundError);
  });
});
