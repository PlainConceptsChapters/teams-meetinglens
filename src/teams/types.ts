export interface ChannelAttachment {
  name?: string;
  contentType?: string;
  size?: number;
  url?: string;
}

export interface ChannelMention {
  id?: string;
  name?: string;
  text?: string;
}

export interface ChannelRequest {
  channelId: string;
  conversationId: string;
  messageId: string;
  fromUserId: string;
  fromUserName?: string;
  tenantId?: string;
  text: string;
  attachments?: ChannelAttachment[];
  mentions?: ChannelMention[];
  value?: unknown;
  timestamp?: string;
  locale?: string;
  meetingId?: string;
  meetingJoinUrl?: string;
  graphToken?: string;
  signInLink?: string;
}

export interface ChannelResponse {
  text: string;
  metadata?: Record<string, string | undefined>;
}

export type ChannelCommandHandler = (request: ChannelRequest) => Promise<ChannelResponse>;

export interface CommandRoute {
  command: string;
  handler: ChannelCommandHandler;
  description?: string;
}

export interface ChannelNormalizationOptions {
  maxLength?: number;
  botMentionText?: string;
}
