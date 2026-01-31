import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { isLogEnabled, setLogEnabled, logEvent } from '../../scripts/bot/logging.js';
import type { ChannelRequest } from '../../src/teams/types.js';

const baseRequest: ChannelRequest = {
  channelId: 'msteams',
  conversationId: 'conv',
  messageId: 'msg',
  fromUserId: 'user',
  text: 'hi'
};

describe('bot logging', () => {
  const originalLog = console.log;
  let logMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    logMock = vi.fn();
    console.log = logMock as unknown as typeof console.log;
    setLogEnabled(baseRequest, false);
    process.env.LOG_HASH_SALT = 'salt';
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('does not log when disabled', () => {
    expect(isLogEnabled(baseRequest)).toBe(false);
    logEvent(baseRequest, 'event', { note: 'test' });
    expect(logMock).not.toHaveBeenCalled();
  });

  it('redacts sensitive payload fields', () => {
    setLogEnabled(baseRequest, true);
    logEvent(baseRequest, 'event', {
      email: 'user@example.com',
      url: 'https://example.com/path',
      phone: '+1 555 123 4567',
      id: '123456789',
      token: 'Bearer abcdef',
      jwt: 'eyJabc.def.ghi'
    });
    expect(logMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(logMock.mock.calls[0][0]) as Record<string, string>;
    expect(payload.email).toBe('[REDACTED_EMAIL]');
    expect(payload.url).toBe('[REDACTED_URL]');
    expect(payload.phone).toBe('[REDACTED_PHONE]');
    expect(payload.id).toBe('[REDACTED_PHONE]');
    expect(payload.token).toBe('Bearer [REDACTED_TOKEN]');
    expect(payload.jwt).toBe('[REDACTED_TOKEN]');
    expect(payload.userId).toHaveLength(16);
  });
});
