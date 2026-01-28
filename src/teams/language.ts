import { ChannelRequest } from './types.js';

export type LanguageCode = string;

export const languageNames: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  ro: 'Romanian'
};

export const normalizeLanguage = (value?: string): LanguageCode | undefined => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return undefined;
  }
  const match = trimmed.match(/^[a-z]{2,3}(-[a-z]{2})?$/);
  if (!match) {
    return undefined;
  }
  const [primary] = trimmed.split('-');
  return primary;
};

export const extractLanguageToken = (text: string): { language?: LanguageCode; remainder: string } => {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) {
    return { remainder: '' };
  }
  const first = tokens[0];
  const langMatch = first.match(/^(?:lang[:=])?([a-z]{2,3}(?:-[a-z]{2})?)$/i);
  if (langMatch) {
    const language = normalizeLanguage(langMatch[1]);
    return { language, remainder: tokens.slice(1).join(' ').trim() };
  }
  return { remainder: text.trim() };
};

export const resolveLanguage = (
  request: ChannelRequest,
  explicit?: LanguageCode,
  preferenceStore?: Map<string, LanguageCode>
): LanguageCode => {
  if (explicit) {
    if (preferenceStore) {
      preferenceStore.set(request.conversationId, explicit);
    }
    return explicit;
  }
  const stored = preferenceStore?.get(request.conversationId);
  if (stored) {
    return stored;
  }
  const locale = normalizeLanguage(request.locale);
  if (locale) {
    return locale;
  }
  return 'en';
};
