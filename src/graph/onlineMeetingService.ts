import { GraphClient } from './graphClient.js';
import { InvalidRequestError } from '../errors/index.js';

interface OnlineMeeting {
  id: string;
  joinWebUrl?: string;
}

interface OnlineMeetingListResponse {
  value: OnlineMeeting[];
}

export interface OnlineMeetingServiceOptions {
  graphClient: GraphClient;
}

const escapeOdataString = (value: string): string => value.replace(/'/g, "''");

export class OnlineMeetingService {
  private readonly graphClient: GraphClient;

  constructor(options: OnlineMeetingServiceOptions) {
    this.graphClient = options.graphClient;
  }

  async findOnlineMeetingIdByJoinUrl(joinUrl: string): Promise<string | undefined> {
    if (!joinUrl) {
      throw new InvalidRequestError('Join URL is required to resolve online meeting id.');
    }
    const filter = `JoinWebUrl eq '${escapeOdataString(joinUrl)}'`;
    const response = await this.graphClient.get<OnlineMeetingListResponse>('/me/onlineMeetings', {
      $filter: filter
    });
    return response.value?.[0]?.id;
  }
}
