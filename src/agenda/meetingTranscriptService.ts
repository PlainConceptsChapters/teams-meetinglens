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
      meetingId = await this.onlineMeetingService.findOnlineMeetingIdByJoinUrl(item.joinUrl, item.userId);
    }
    if (!meetingId) {
      throw new NotFoundError('No online meeting id available for this agenda item.');
    }

    const latest = await this.transcriptService.getLatestTranscript(meetingId, item.userId);
    return this.transcriptService.getTranscriptContent(meetingId, latest.id, item.userId);
  }

  async getTranscriptForMeetingContext(options: {
    meetingId?: string;
    joinUrl?: string;
    userId?: string;
  }): Promise<TranscriptContent> {
    let meetingId = options.meetingId;
    if (!meetingId && options.joinUrl) {
      meetingId = await this.onlineMeetingService.findOnlineMeetingIdByJoinUrl(options.joinUrl, options.userId);
    }
    if (!meetingId) {
      throw new NotFoundError('No online meeting id available for meeting context.');
    }

    const latest = await this.transcriptService.getLatestTranscript(meetingId, options.userId);
    return this.transcriptService.getTranscriptContent(meetingId, latest.id, options.userId);
  }
}
