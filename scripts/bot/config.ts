export const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing ${key} environment variable.`);
  }
  return value;
};

export const botMentionText = process.env.BOT_MENTION_TEXT;
export const graphBaseUrl = process.env.GRAPH_BASE_URL ?? 'https://graph.microsoft.com/v1.0';
export const graphAccessToken = process.env.GRAPH_ACCESS_TOKEN;
export const oauthConnection = process.env.BOT_OAUTH_CONNECTION;
export const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
