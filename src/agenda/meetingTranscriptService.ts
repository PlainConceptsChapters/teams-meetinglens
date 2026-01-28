import { NotFoundError } from '../errors/index.js';
import { OnlineMeetingService } from '../graph/onlineMeetingService.js';
import { TranscriptService } from '../transcripts/transcriptService.js';
import { TranscriptContent } from '../types/transcript.js';
import { AgendaItem } from './types.js';

export interface MeetingTranscriptServiceOptions {
  onlineMeetingService: OnlineMeetingService;
  transcriptService: TranscriptService;
}

export class MeetingTranscriptService {
  private readonly onlineMeetingService: OnlineMeetingService;
  private readonly transcriptService: TranscriptService;

  constructor(options: MeetingTranscriptServiceOptions) {
    this.onlineMeetingService = options.onlineMeetingService;
    this.transcriptService = options.transcriptService;
  }

  async getTranscriptForAgendaItem(item: AgendaItem): Promise<TranscriptContent> {
    let meetingId = item.onlineMeetingId;
    if (!meetingId && item.joinUrl) {
      meetingId = await this.onlineMeetingService.findOnlineMeetingIdByJoinUrl(item.joinUrl);
    }
    if (!meetingId) {
      throw new NotFoundError('No online meeting id available for this agenda item.');
    }

    const latest = await this.transcriptService.getLatestTranscript(meetingId);
    return this.transcriptService.getTranscriptContent(meetingId, latest.id);
  }
}
