import { describe, expect, it } from 'vitest';
import { TranscriptService } from '../../src/transcripts/transcriptService.js';
import { NotFoundError } from '../../src/errors/index.js';

const createGraphClient = (responses: { list?: unknown; content?: string; status?: number } = {}) => {
  return {
    get: async () => responses.list ?? { value: [] },
    requestText: async () => {
      if (responses.status && responses.status !== 200) {
        const error = new Error('fail');
        (error as { status?: number }).status = responses.status;
        throw error;
      }
      return responses.content ?? 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhello';
    }
  };
};

describe('TranscriptService', () => {
  it('returns latest transcript metadata', async () => {
    const service = new TranscriptService({
      graphClient: createGraphClient({ list: { value: [{ id: 't1' }] } }) as any
    });

    const latest = await service.getLatestTranscript('meeting');
    expect(latest.id).toBe('t1');
  });

  it('throws when no transcripts are available', async () => {
    const service = new TranscriptService({ graphClient: createGraphClient() as any });
    await expect(service.getLatestTranscript('meeting')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('parses transcript content into cues', async () => {
    const service = new TranscriptService({ graphClient: createGraphClient() as any });
    const content = await service.getTranscriptContent('meeting', 'transcript');
    expect(content.cues).toHaveLength(1);
    expect(content.cues[0].text).toBe('hello');
  });
});
