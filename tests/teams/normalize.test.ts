import { describe, expect, it } from 'vitest';
import { extractCommand, normalizeChannelRequest } from '../../src/teams/normalize.js';
import { InvalidRequestError } from '../../src/errors/index.js';
import { ChannelRequest } from '../../src/teams/types.js';

const baseRequest: ChannelRequest = {
  channelId: 'c1',
  conversationId: 'conv',
  messageId: 'm1',
  fromUserId: 'u1',
  text: '  hello   world  '
};

describe('normalizeChannelRequest', () => {
  it('collapses whitespace', () => {
    const normalized = normalizeChannelRequest(baseRequest);
    expect(normalized.text).toBe('hello world');
  });

  it('throws on empty text', () => {
    expect(() => normalizeChannelRequest({ ...baseRequest, text: '   ' })).toThrow(InvalidRequestError);
  });
});

describe('extractCommand', () => {
  it('detects command with remainder', () => {
    const result = extractCommand('/summary plan the meeting');
    expect(result.command).toBe('summary');
    expect(result.remainder).toBe('plan the meeting');
  });
});
