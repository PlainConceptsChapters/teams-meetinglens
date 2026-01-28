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
    // .env is optional
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

const parseCodeInput = (rawInput) => {
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
    // Keep raw input
  }
  if (!code) {
    throw new Error('Could not find a code parameter in the URL.');
  }
  return code;
};

const resolveMeetingId = async (graphBaseUrl, accessToken, joinUrl) => {
  const url = new URL(`${graphBaseUrl.replace(/\/$/, '')}/me/onlineMeetings`);
  const filter = `joinWebUrl eq '${joinUrl.replace(/'/g, "''")}'`;
  url.searchParams.set('$filter', filter);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Meeting lookup failed: ${response.status} ${JSON.stringify(payload)} (url: ${url.toString()})`);
  }

  const meeting = Array.isArray(payload.value) ? payload.value[0] : undefined;
  if (!meeting?.id) {
    throw new Error('No online meeting found for that join URL.');
  }

  return meeting.id;
};

const listTranscripts = async (graphBaseUrl, accessToken, meetingId) => {
  const url = `${graphBaseUrl.replace(/\/$/, '')}/me/onlineMeetings/${meetingId}/transcripts`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Transcript list failed: ${response.status} ${JSON.stringify(payload)} (url: ${url})`);
  }

  return Array.isArray(payload.value) ? payload.value : [];
};

const fetchTranscriptContent = async (baseUrl, accessToken, meetingId, transcriptId, formatQuery, label) => {
  const url = `${baseUrl.replace(/\/$/, '')}/me/onlineMeetings/${meetingId}/transcripts/${transcriptId}/content${formatQuery}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'text/vtt'
    }
  });

  if (!response.ok) {
    const payload = await response.text();
    const error = new Error(
      `Transcript content failed: ${response.status} ${payload} (url: ${url}) (attempt: ${label})`
    );
    error.status = response.status;
    throw error;
  }

  return response.text();
};

const main = async () => {
  const env = await loadEnv();
  const tenantId = requireValue(env, 'AZURE_TENANT_ID');
  const clientId = requireValue(env, 'AZURE_CLIENT_ID');
  const clientSecret = requireValue(env, 'AZURE_CLIENT_SECRET');
  const scopes = requireValue(env, 'GRAPH_SCOPES').split(' ').filter(Boolean);
  const authorityHost = env.AUTHORITY_HOST || 'https://login.microsoftonline.com';
  const graphBaseUrl = env.GRAPH_BASE_URL || 'https://graph.microsoft.com/v1.0';
  const graphBetaBaseUrl = env.GRAPH_BETA_BASE_URL || 'https://graph.microsoft.com/beta';
  const redirectUri = env.REDIRECT_URI || 'http://localhost:3000';

  const state = Math.random().toString(36).slice(2);
  const authUrl = buildAuthUrl(authorityHost, tenantId, clientId, scopes, redirectUri, state);

  console.log('\nOpen this URL in a browser and sign in:');
  console.log(authUrl);
  console.log('\nAfter signing in, copy the redirect URL or the code query param.');

  const rawInput = await prompt('Paste the full redirect URL or just the code: ');
  const code = parseCodeInput(rawInput);

  const accessToken = await exchangeCodeForToken({
    authorityHost,
    tenantId,
    clientId,
    clientSecret,
    scopes,
    redirectUri,
    code
  });

  const meetingIdOrJoinUrl = await prompt('Enter onlineMeetingId or joinUrl: ');
  if (!meetingIdOrJoinUrl) {
    throw new Error('Meeting id or join URL is required.');
  }

  let meetingId = meetingIdOrJoinUrl;
  if (meetingIdOrJoinUrl.startsWith('http://') || meetingIdOrJoinUrl.startsWith('https://')) {
    meetingId = await resolveMeetingId(graphBaseUrl, accessToken, meetingIdOrJoinUrl);
  }

  const transcripts = await listTranscripts(graphBaseUrl, accessToken, meetingId);
  console.log(`\nTranscripts found: ${transcripts.length}`);
  if (transcripts[0]?.id) {
    const transcriptId = transcripts[0].id;
    const attempts = [
      { baseUrl: graphBaseUrl, formatQuery: '?$format=text/vtt', label: 'v1.0 text/vtt' },
      { baseUrl: graphBaseUrl, formatQuery: '', label: 'v1.0 default' },
      { baseUrl: graphBetaBaseUrl, formatQuery: '?$format=text/vtt', label: 'beta text/vtt' },
      { baseUrl: graphBetaBaseUrl, formatQuery: '', label: 'beta default' }
    ];

    let content = '';
    const attemptErrors = [];
    for (const attempt of attempts) {
      try {
        content = await fetchTranscriptContent(
          attempt.baseUrl,
          accessToken,
          meetingId,
          transcriptId,
          attempt.formatQuery,
          attempt.label
        );
        break;
      } catch (error) {
        attemptErrors.push(error instanceof Error ? error.message : String(error));
        if (error?.status !== 404) {
          throw error;
        }
      }
    }

    if (!content) {
      console.log('\nTranscript content attempts:');
      for (const message of attemptErrors) {
        console.log(`- ${message}`);
      }
      throw new Error('Transcript content not found on v1.0 or beta endpoints.');
    }

    const preview = content.slice(0, 400).replace(/\s+/g, ' ').trim();
    console.log('Transcript preview:', preview.length ? preview : '(empty)');
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
