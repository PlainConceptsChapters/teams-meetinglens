export const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing ${key} environment variable.`);
  }
  return value;
};

const parseNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

const parseMinutes = (value: string | undefined, fallbackMinutes: number): number => {
  const parsed = parseNumber(value, fallbackMinutes);
  return parsed * 60 * 1000;
};

export const botMentionText = process.env.BOT_MENTION_TEXT;
export const graphBaseUrl = process.env.GRAPH_BASE_URL ?? 'https://graph.microsoft.com/v1.0';
export const graphAccessToken = process.env.GRAPH_ACCESS_TOKEN;
export const oauthConnection = process.env.BOT_OAUTH_CONNECTION;
export const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
export const agendaMaxItems = parseNumber(process.env.AGENDA_MAX_ITEMS, 25);
const agendaTranscriptChecks = parseNumber(process.env.AGENDA_MAX_TRANSCRIPT_CHECKS, 25);
export const agendaMaxTranscriptChecks = Math.max(agendaMaxItems, agendaTranscriptChecks);
export const calendarMaxPages = parseNumber(process.env.CALENDAR_MAX_PAGES, 3);
export const selectionTtlMs = parseMinutes(process.env.SELECTION_TTL_MINUTES, 60);

const summaryMaxTokensPerChunk = parseNumber(process.env.SUMMARY_MAX_TOKENS_PER_CHUNK, 1500);
const summaryOverlapTokens = parseNumber(process.env.SUMMARY_OVERLAP_TOKENS, 150);
const summaryMaxChunks = parseNumber(process.env.SUMMARY_MAX_CHUNKS, 6);
const summaryParallelism = parseNumber(process.env.SUMMARY_PARALLELISM, 3);
const summaryMaxParallelism = parseNumber(process.env.SUMMARY_MAX_PARALLELISM, 4);

export const summaryOptions = {
  maxTokensPerChunk: summaryMaxTokensPerChunk,
  overlapTokens: summaryOverlapTokens,
  maxChunks: summaryMaxChunks,
  parallelism: Math.min(summaryParallelism, summaryMaxParallelism)
};
