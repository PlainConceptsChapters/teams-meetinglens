import { InvalidRequestError } from '../errors/index.js';
import { ChannelNormalizationOptions, ChannelRequest } from './types.js';

const collapseWhitespace = (text: string): string => text.replace(/\s+/g, ' ').trim();

const stripLeadingMention = (text: string, botMentionText?: string): string => {
  if (!botMentionText) {
    return text;
  }
  const escaped = botMentionText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escaped}\\s*`, 'i');
  return text.replace(pattern, '');
};

export const normalizeChannelRequest = (
  request: ChannelRequest,
  options: ChannelNormalizationOptions = {}
): ChannelRequest => {
  const maxLength = options.maxLength ?? 4000;
  const stripped = stripLeadingMention(request.text ?? '', options.botMentionText);
  const text = collapseWhitespace(stripped);

  if (!text) {
    throw new InvalidRequestError('Empty message content.');
  }

  const normalizedText = text.length > maxLength ? text.slice(0, maxLength) : text;

  return {
    ...request,
    text: normalizedText
  };
};

export const extractCommand = (text: string): { command?: string; remainder: string } => {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) {
    return { remainder: trimmed };
  }
  const [commandToken, ...rest] = trimmed.split(' ');
  const command = commandToken.slice(1).toLowerCase();
  return { command, remainder: rest.join(' ').trim() };
};
