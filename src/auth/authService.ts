import { AuthError } from '../errors/index.js';
import { AccessToken, AuthConfig, TokenCache } from './types.js';

export interface AuthServiceOptions {
  config: AuthConfig;
  cache: TokenCache;
  fetcher?: typeof fetch;
  clockSkewSeconds?: number;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

const resolveAuthorityHost = (authorityHost?: string): string => {
  if (!authorityHost) {
    return 'https://login.microsoftonline.com';
  }
  return authorityHost.replace(/\/$/, '');
};

export class AuthService {
  private readonly config: AuthConfig;
  private readonly cache: TokenCache;
  private readonly fetcher: typeof fetch;
  private readonly clockSkewSeconds: number;

  constructor(options: AuthServiceOptions) {
    this.config = options.config;
    this.cache = options.cache;
    this.fetcher = options.fetcher ?? fetch;
    this.clockSkewSeconds = options.clockSkewSeconds ?? 60;
  }

  async acquireOboToken(userId: string, userAssertion: string, scopes: string[]): Promise<AccessToken> {
    const cacheKey = { tenantId: this.config.tenantId, userId, scopes };
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const response = await this.fetcher(this.buildTokenUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: this.buildTokenBody(userAssertion, scopes)
    });

    if (!response.ok) {
      const errorPayload = (await response.json().catch(() => ({}))) as TokenResponse;
      throw new AuthError(this.formatAuthError(errorPayload) ?? `OBO token request failed (${response.status})`);
    }

    const payload = (await response.json()) as TokenResponse;
    if (!payload.access_token || !payload.expires_in) {
      throw new AuthError('OBO token response missing access token or expiry.');
    }

    const expiresAt = new Date(Date.now() + Math.max(payload.expires_in - this.clockSkewSeconds, 0) * 1000);
    const token: AccessToken = { token: payload.access_token, expiresAt };
    this.cache.set(cacheKey, token);
    return token;
  }

  private buildTokenUrl(): string {
    const host = resolveAuthorityHost(this.config.authorityHost);
    return `${host}/${this.config.tenantId}/oauth2/v2.0/token`;
  }

  private buildTokenBody(userAssertion: string, scopes: string[]): URLSearchParams {
    const body = new URLSearchParams();
    body.set('client_id', this.config.clientId);
    body.set('client_secret', this.config.clientSecret);
    body.set('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    body.set('requested_token_use', 'on_behalf_of');
    body.set('scope', scopes.join(' '));
    body.set('assertion', userAssertion);
    return body;
  }

  private formatAuthError(payload: TokenResponse): string | undefined {
    if (!payload.error) {
      return undefined;
    }
    const description = payload.error_description ? `: ${payload.error_description}` : '';
    return `${payload.error}${description}`;
  }
}
