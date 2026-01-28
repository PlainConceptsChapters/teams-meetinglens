import { ChannelRequest } from './types.js';

export type SupportedLanguage = 'en' | 'es' | 'ro';

export const languageNames: Record<SupportedLanguage, string> = {
  en: 'English',
  es: 'Spanish',
  ro: 'Romanian'
};

export const normalizeLanguage = (value?: string): SupportedLanguage | undefined => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith('es')) {
    return 'es';
  }
  if (trimmed.startsWith('ro')) {
    return 'ro';
  }
  if (trimmed.startsWith('en')) {
    return 'en';
  }
  return undefined;
};

export const extractLanguageToken = (text: string): { language?: SupportedLanguage; remainder: string } => {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) {
    return { remainder: '' };
  }
  const first = tokens[0];
  const langMatch = first.match(/^(?:lang[:=])?(en|es|ro)$/i);
  if (langMatch) {
    const language = normalizeLanguage(langMatch[1]);
    return { language, remainder: tokens.slice(1).join(' ').trim() };
  }
  return { remainder: text.trim() };
};

export const resolveLanguage = (
  request: ChannelRequest,
  explicit?: SupportedLanguage,
  preferenceStore?: Map<string, SupportedLanguage>
): SupportedLanguage => {
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
