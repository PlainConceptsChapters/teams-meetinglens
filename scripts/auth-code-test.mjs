import fs from 'node:fs/promises';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const loadEnv = async () => {
  const env = { ...process.env };
  try {
    const content = await fs.readFile('.env', 'utf8');
    for (const line of content.split(/\r?\n/)) {
      if (!line || line.trim().startsWith('#')) {
        continue;
      }
      const index = line.indexOf('=');
      if (index < 0) {
        continue;
      }
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim();
      if (!(key in env) && value.length > 0) {
        env[key] = value;
      }
    }
  } catch {
    // .env is optional; fall back to process.env
  }
  return env;
};

const requireValue = (env, key) => {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing ${key}. Set it in .env or environment variables.`);
  }
  return value;
};

const prompt = async (question) => {
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
};

const buildAuthUrl = (authorityHost, tenantId, clientId, scopes, redirectUri, state) => {
  const url = new URL(`${authorityHost.replace(/\/$/, '')}/${tenantId}/oauth2/v2.0/authorize`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_mode', 'query');
  url.searchParams.set('scope', scopes.join(' '));
  url.searchParams.set('state', state);
  return url.toString();
};

const exchangeCodeForToken = async ({ authorityHost, tenantId, clientId, clientSecret, scopes, redirectUri, code }) => {
  const tokenUrl = `${authorityHost.replace(/\/$/, '')}/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams();
  body.set('client_id', clientId);
  body.set('client_secret', clientSecret);
  body.set('grant_type', 'authorization_code');
  body.set('code', code);
  body.set('redirect_uri', redirectUri);
  body.set('scope', scopes.join(' '));

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Token exchange failed: ${payload.error ?? response.status} ${payload.error_description ?? ''}`.trim());
  }

  return payload.access_token;
};

const fetchCalendarSample = async (graphBaseUrl, accessToken) => {
  const now = new Date();
  const start = new Date(now.getTime() - 60 * 60 * 1000);
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const url = new URL(`${graphBaseUrl.replace(/\/$/, '')}/me/calendarView`);
  url.searchParams.set('startDateTime', start.toISOString());
  url.searchParams.set('endDateTime', end.toISOString());
  url.searchParams.set('$top', '5');

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Graph call failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  const count = Array.isArray(payload.value) ? payload.value.length : 0;
  return { count, sample: payload.value?.[0] };
};

const main = async () => {
  const env = await loadEnv();
  const tenantId = requireValue(env, 'AZURE_TENANT_ID');
  const clientId = requireValue(env, 'AZURE_CLIENT_ID');
  const clientSecret = requireValue(env, 'AZURE_CLIENT_SECRET');
  const scopes = requireValue(env, 'GRAPH_SCOPES').split(' ').filter(Boolean);
  const authorityHost = env.AUTHORITY_HOST || 'https://login.microsoftonline.com';
  const graphBaseUrl = env.GRAPH_BASE_URL || 'https://graph.microsoft.com/v1.0';
  const redirectUri = env.REDIRECT_URI || 'http://localhost:3000';

  const state = Math.random().toString(36).slice(2);
  const authUrl = buildAuthUrl(authorityHost, tenantId, clientId, scopes, redirectUri, state);

  console.log('\nOpen this URL in a browser and sign in:');
  console.log(authUrl);
  console.log('\nAfter signing in, copy the "code" query param from the redirect URL.');

  const rawInput = await prompt('Paste the full redirect URL or just the code: ');
  if (!rawInput) {
    throw new Error('No code provided.');
  }
  let code = rawInput;
  try {
    if (rawInput.startsWith('http://') || rawInput.startsWith('https://')) {
      const parsed = new URL(rawInput);
      code = parsed.searchParams.get('code') ?? '';
    }
  } catch {
    // Keep raw input if URL parsing fails
  }
  if (!code) {
    throw new Error('Could not find a code parameter in the URL.');
  }

  const accessToken = await exchangeCodeForToken({
    authorityHost,
    tenantId,
    clientId,
    clientSecret,
    scopes,
    redirectUri,
    code
  });

  const result = await fetchCalendarSample(graphBaseUrl, accessToken);
  console.log(`\nCalendarView ok. Events returned: ${result.count}`);
  if (result.sample) {
    console.log('Sample event subject:', result.sample.subject ?? '(no subject)');
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
