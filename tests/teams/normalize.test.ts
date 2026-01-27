import { describe, expect, it } from 'vitest';
import { extractCommand, normalizeChannelRequest } from '../../src/teams/normalize.js';
import { InvalidRequestError } from '../../src/errors/index.js';

const baseRequest = {
  channelId: 'c1',
  conversationId: 'conv',
  messageId: 'm1',
  fromUserId: 'u1',
  text: '  hello   world  '
};

describe('normalizeChannelRequest', () => {
  it('collapses whitespace', () => {
    const normalized = normalizeChannelRequest(baseRequest as any);
    expect(normalized.text).toBe('hello world');
  });

  it('throws on empty text', () => {
    expect(() => normalizeChannelRequest({ ...baseRequest, text: '   ' } as any)).toThrow(InvalidRequestError);
  });
});

describe('extractCommand', () => {
  it('detects command with remainder', () => {
    const result = extractCommand('/summary plan the meeting');
    expect(result.command).toBe('summary');
    expect(result.remainder).toBe('plan the meeting');
  });
});
