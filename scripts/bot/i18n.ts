import fs from 'node:fs/promises';
import path from 'node:path';
import { TranslationService } from '../../src/llm/translationService.js';
import type { LlmClient } from '../../src/llm/types.js';
import { LanguageCode, normalizeLanguage } from '../../src/teams/language.js';
import type { ChannelRequest } from '../../src/teams/types.js';
import { getLanguageKey, languageStore } from './stores.js';

export type TranslationCatalog = Record<string, unknown>;

export const loadTranslations = async (): Promise<TranslationCatalog> => {
  const root = path.resolve(process.cwd(), 'src', 'i18n');
  const enRaw = await fs.readFile(path.join(root, 'en.json'), 'utf8');
  return JSON.parse(enRaw) as TranslationCatalog;
};

const protectCommandTokens = (text: string) => {
  const tokens: string[] = [];
  const protectedText = text.replace(/\/[a-z0-9_-]+/gi, (match) => {
    const key = `__CMD${tokens.length}__`;
    tokens.push(match);
    return key;
  });
  return { protectedText, tokens };
};

const restoreCommandTokens = (text: string, tokens: string[]) => {
  return tokens.reduce((value, token, index) => value.replaceAll(`__CMD${index}__`, token), text);
};

const isLikelyEnglishText = (text?: string) => {
  if (!text) {
    return false;
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  // eslint-disable-next-line no-control-regex
  const asciiOnly = /^[\x00-\x7F]*$/.test(trimmed);
  if (!asciiOnly) {
    return false;
  }
  return trimmed.length <= 20 || /^[a-z0-9\s.,!?"'-]+$/i.test(trimmed);
};

const hasNonAscii = (text?: string) => {
  if (!text) {
    return false;
  }
  // eslint-disable-next-line no-control-regex
  return /[^\x00-\x7F]/.test(text);
};

const looksHebrew = (text: string) => /[\u0590-\u05FF]/.test(text);
const looksChinese = (text: string) => /[\u4E00-\u9FFF]/.test(text);
const looksJapanese = (text: string) => /[\u3040-\u30FF]/.test(text);
const looksKorean = (text: string) => /[\u1100-\u11FF\uAC00-\uD7AF]/.test(text);

const hasSpanishMarkers = (text: string) =>
  /\b(el|la|los|las|de|del|que|y|en|por|para|con|una|un|no|sí)\b/i.test(text);

const hasEnglishMarkers = (text: string) =>
  /\b(the|and|or|but|please|meeting|summary|could|couldn|cant|cannot|can\\'t|try)\b/i.test(text);

const isLikelyLanguage = (text: string, language: LanguageCode): boolean => {
  const value = text.trim();
  if (!value) {
    return true;
  }
  if (language === 'es') {
    const hasAccents = /[\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1\u00fc\u00bf\u00a1]/i.test(value);
    if (hasAccents) {
      return true;
    }
    if (hasEnglishMarkers(value) && !hasSpanishMarkers(value)) {
      return false;
    }
    if (hasSpanishMarkers(value)) {
      return true;
    }
    return /^[a-z0-9\s.,!?"'%-]+$/i.test(value);
  }
  if (language === 'en') {
    if (hasNonAscii(value)) {
      return false;
    }
    return /^[a-z0-9\s.,!?"'%-]+$/i.test(value);
  }
  if (language === 'he') {
    return looksHebrew(value);
  }
  if (language === 'zh') {
    return looksChinese(value);
  }
  if (language === 'ja') {
    return looksJapanese(value);
  }
  if (language === 'ko') {
    return looksKorean(value);
  }
  return true;
};

const enforceLanguage = (text: string, language: LanguageCode, fallback: string): string => {
  if (isLikelyLanguage(text, language)) {
    return text;
  }
  return fallback;
};

export const createI18n = (translations: TranslationCatalog, buildLlmClient: () => LlmClient) => {
  let translationService: TranslationService | undefined;
  const autoLanguageAllowList = new Set<LanguageCode>(['en', 'es']);

  const t = (keyPath: string, vars?: Record<string, string>): string => {
    const value = keyPath.split('.').reduce<unknown>((acc, key) => {
      if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, translations);
    if (typeof value !== 'string') {
      return keyPath;
    }
    if (!vars) {
      return value;
    }
    return Object.entries(vars).reduce((text, [varKey, varValue]) => {
      return text.replaceAll(`{${varKey}}`, varValue);
    }, value);
  };

  const getTranslationService = (): TranslationService | undefined => {
    if (translationService) {
      return translationService;
    }
    try {
      const client = buildLlmClient();
      translationService = new TranslationService({ client });
      return translationService;
    } catch {
      return undefined;
    }
  };

  const translateOutgoing = async (text: string, language: LanguageCode): Promise<string> => {
    if (!text.trim() || language === 'en') {
      return text;
    }
    const service = getTranslationService();
    if (!service) {
      return text;
    }
    const protectedText = protectCommandTokens(text);
    const translated = await service.translate(protectedText.protectedText, language);
    const restored = restoreCommandTokens(translated, protectedText.tokens);
    return enforceLanguage(restored, language, text);
  };

  const translateToEnglish = async (text: string, language: LanguageCode): Promise<string> => {
    if (!text.trim() || language === 'en') {
      return text;
    }
    const service = getTranslationService();
    if (!service) {
      return text;
    }
    const protectedText = protectCommandTokens(text);
    const translated = await service.translate(protectedText.protectedText, 'en');
    return enforceLanguage(restoreCommandTokens(translated, protectedText.tokens), 'en', text);
  };

  const resolvePreferredLanguage = async (
    request: ChannelRequest,
    explicit?: LanguageCode
  ): Promise<LanguageCode> => {
    if (explicit) {
      languageStore.set(getLanguageKey(request), { code: explicit, source: 'explicit' });
      return explicit;
    }
    const stored = languageStore.get(getLanguageKey(request));
    if (stored) {
      return stored.code;
    }
    const locale = normalizeLanguage(request.locale);
    if (locale) {
      if (autoLanguageAllowList.has(locale)) {
        languageStore.set(getLanguageKey(request), { code: locale, source: 'auto' });
        return locale;
      }
      if (isLikelyEnglishText(request.text)) {
        return 'en';
      }
      return 'en';
    }
    if (hasNonAscii(request.text)) {
      const service = getTranslationService();
      if (service && request.text) {
        try {
          const detected = normalizeLanguage(await service.detectLanguage(request.text)) ?? 'en';
          const resolved = autoLanguageAllowList.has(detected) ? detected : 'en';
          languageStore.set(getLanguageKey(request), { code: resolved, source: 'auto' });
          return resolved;
        } catch {
          return 'en';
        }
      }
    }
    return 'en';
  };

  const buildHelpText = (): string => {
    return [
      t('help.title'),
      t('help.overview'),
      '',
      t('help.commandsTitle'),
      t('help.agenda'),
      t('help.select'),
      t('help.summary'),
      t('help.qa'),
      t('help.language'),
      t('help.how'),
      t('help.contribute'),
      t('help.help'),
      t('help.whoami'),
      t('help.version'),
      t('help.graphdebug'),
      t('help.logs'),
      t('help.logout'),
      '',
      t('help.examplesTitle'),
      t('help.examples')
    ].join('\n');
  };

  return {
    t,
    translateOutgoing,
    translateToEnglish,
    resolvePreferredLanguage,
    buildHelpText
  };
};
