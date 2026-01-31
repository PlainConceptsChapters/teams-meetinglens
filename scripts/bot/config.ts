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

export const botMentionText = process.env.BOT_MENTION_TEXT;
export const graphBaseUrl = process.env.GRAPH_BASE_URL ?? 'https://graph.microsoft.com/v1.0';
export const graphAccessToken = process.env.GRAPH_ACCESS_TOKEN;
export const oauthConnection = process.env.BOT_OAUTH_CONNECTION;
export const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
export const agendaMaxItems = parseNumber(process.env.AGENDA_MAX_ITEMS, 25);
const agendaTranscriptChecks = parseNumber(process.env.AGENDA_MAX_TRANSCRIPT_CHECKS, 25);
export const agendaMaxTranscriptChecks = Math.max(agendaMaxItems, agendaTranscriptChecks);
