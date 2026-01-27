import { GraphClient } from '../graph/graphClient.js';
import { mapGraphError, NotFoundError } from '../errors/index.js';
import { TranscriptContent, TranscriptMetadata } from '../types/transcript.js';
import { parseWebVtt } from './vttParser.js';

interface TranscriptListResponse {
  value: TranscriptMetadata[];
}

export interface TranscriptServiceOptions {
  graphClient: GraphClient;
}

export class TranscriptService {
  private readonly graphClient: GraphClient;

  constructor(options: TranscriptServiceOptions) {
    this.graphClient = options.graphClient;
  }

  async listTranscripts(meetingId: string): Promise<TranscriptMetadata[]> {
    if (!meetingId) {
      throw new NotFoundError('Meeting id is required to list transcripts.');
    }
    const response = await this.graphClient.get<TranscriptListResponse>(
      `/me/onlineMeetings/${meetingId}/transcripts`
    );
    return response.value ?? [];
  }

  async getLatestTranscript(meetingId: string): Promise<TranscriptMetadata> {
    const transcripts = await this.listTranscripts(meetingId);
    if (!transcripts.length) {
      throw new NotFoundError('No transcripts available for this meeting.');
    }
    return transcripts[0];
  }

  async getTranscriptContent(meetingId: string, transcriptId: string): Promise<TranscriptContent> {
    if (!meetingId || !transcriptId) {
      throw new NotFoundError('Meeting id and transcript id are required.');
    }

    const attempts = [
      { formatQuery: '?$format=text/vtt', label: 'text/vtt' },
      { formatQuery: '', label: 'default' }
    ];

    let lastError: unknown;
    for (const attempt of attempts) {
      try {
        const raw = await this.graphClient.requestText(
          `/me/onlineMeetings/${meetingId}/transcripts/${transcriptId}/content${attempt.formatQuery}`
        );
        return { raw, cues: parseWebVtt(raw) };
      } catch (error) {
        lastError = error;
        if (error instanceof Error && 'status' in error) {
          const status = Number((error as { status?: number }).status ?? 0);
          if (status !== 404) {
            throw error;
          }
        }
      }
    }

    if (lastError instanceof Error && 'status' in lastError) {
      const status = Number((lastError as { status?: number }).status ?? 404);
      throw mapGraphError(status, 'Transcript content not found.');
    }

    throw new NotFoundError('Transcript content not found.');
  }
}
