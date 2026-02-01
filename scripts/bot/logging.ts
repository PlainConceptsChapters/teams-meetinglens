import crypto from 'node:crypto';
import type { ChannelRequest } from '../../src/teams/types.js';
import { getLanguageKey } from './stores.js';

const logStore = new Map<string, boolean>();

export const getLogKey = (request: Pick<ChannelRequest, 'conversationId' | 'fromUserId'>) => getLanguageKey(request);

export const isLogEnabled = (request: Pick<ChannelRequest, 'conversationId' | 'fromUserId'>) =>
  logStore.get(getLogKey(request)) ?? false;

export const setLogEnabled = (request: Pick<ChannelRequest, 'conversationId' | 'fromUserId'>, enabled: boolean) => {
  logStore.set(getLogKey(request), enabled);
};

const hashValue = (value?: string): string => {
  if (!value) {
    return 'unknown';
  }
  const salt = process.env.LOG_HASH_SALT ?? '';
  return crypto.createHash('sha256').update(`${salt}:${value}`).digest('hex').slice(0, 16);
};

const redactText = (value: string): string => {
  return value
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/https?:\/\/\S+/gi, '[REDACTED_URL]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[REDACTED_PHONE]')
    .replace(/\b\d{6,}\b/g, '[REDACTED_ID]')
    .replace(/Bearer\s+[A-Za-z0-9\-_.=]+/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_TOKEN]');
};

const truncateText = (value: string, maxLength = 200): string => {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...`;
};

const sanitizePayload = (value: unknown, maxLength = 200): unknown => {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return truncateText(redactText(value), maxLength);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePayload(item, maxLength));
  }
  if (typeof value === 'object') {
    return Object.entries(value).reduce<Record<string, unknown>>((acc, [key, val]) => {
      acc[key] = sanitizePayload(val, maxLength);
      return acc;
    }, {});
  }
  return String(value);
};

export const logEventWithOptions = (
  request: ChannelRequest,
  event: string,
  payload: Record<string, unknown>,
  options?: { maxLength?: number }
) => {
  if (!isLogEnabled(request)) {
    return;
  }
  const base = {
    timestamp: new Date().toISOString(),
    level: 'info',
    message: event,
    operation: event,
    component: 'bot',
    event,
    conversationId: hashValue(request.conversationId),
    userId: hashValue(request.fromUserId),
    tenantId: hashValue(request.tenantId),
    messageId: hashValue(request.messageId),
    meetingId: hashValue(request.meetingId),
    correlationId: request.correlationId ?? undefined
  };
  const sanitized = sanitizePayload(payload, options?.maxLength ?? 200);
  console.log(JSON.stringify({ ...base, ...(sanitized as Record<string, unknown>) }));
};

export const logEvent = (request: ChannelRequest, event: string, payload: Record<string, unknown>) => {
  logEventWithOptions(request, event, payload);
};
