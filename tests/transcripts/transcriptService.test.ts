import { describe, expect, it } from 'vitest';
import { GraphClient } from '../../src/graph/graphClient.js';
import { TranscriptService } from '../../src/transcripts/transcriptService.js';
import { NotFoundError } from '../../src/errors/index.js';

const createGraphClient = (responses: { list?: unknown; content?: string; status?: number } = {}) => {
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    );
    const path = url.pathname;

    if (path.endsWith('/transcripts') && !path.includes('/content')) {
      return new Response(JSON.stringify(responses.list ?? { value: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (path.includes('/content')) {
      const status = responses.status ?? 200;
      const body = responses.content ?? 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhello';
      return new Response(body, { status });
    }

    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  return new GraphClient({
    tokenProvider: async () => 'token',
    fetcher
  });
};

describe('TranscriptService', () => {
  it('returns latest transcript metadata', async () => {
    const service = new TranscriptService({
      graphClient: createGraphClient({ list: { value: [{ id: 't1' }] } })
    });

    const latest = await service.getLatestTranscript('meeting');
    expect(latest.id).toBe('t1');
  });

  it('throws when no transcripts are available', async () => {
    const service = new TranscriptService({ graphClient: createGraphClient() });
    await expect(service.getLatestTranscript('meeting')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('parses transcript content into cues', async () => {
    const service = new TranscriptService({ graphClient: createGraphClient() });
    const content = await service.getTranscriptContent('meeting', 'transcript');
    expect(content.cues).toHaveLength(1);
    expect(content.cues[0].text).toBe('hello');
  });
});
