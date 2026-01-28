import { describe, expect, it } from 'vitest';
import { AuthService } from '../../src/auth/authService.js';
import { InMemoryTokenCache } from '../../src/auth/tokenCache.js';

const createFetcher = (handler: (input: RequestInfo, init?: RequestInit) => Promise<Response>) => {
  return ((input: RequestInfo, init?: RequestInit) => handler(input, init)) as typeof fetch;
};

const createJsonResponse = (payload: unknown, status = 200) => {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
};

describe('AuthService', () => {
  it('acquires and caches OBO tokens', async () => {
    let callCount = 0;
    const fetcher = createFetcher(async (input, init) => {
      void input;
      void init;
      callCount += 1;
      return createJsonResponse({ access_token: 'token-123', expires_in: 3600 });
    });

    const authService = new AuthService({
      config: {
        tenantId: 'tenant',
        clientId: 'client',
        clientSecret: 'secret'
      },
      cache: new InMemoryTokenCache(),
      fetcher
    });

    const token1 = await authService.acquireOboToken('user', 'assertion', ['Calendars.Read']);
    const token2 = await authService.acquireOboToken('user', 'assertion', ['Calendars.Read']);

    expect(token1.token).toBe('token-123');
    expect(token2.token).toBe('token-123');
    expect(callCount).toBe(1);
  });

  it('throws AuthError on failed token response', async () => {
    const fetcher = createFetcher(async () =>
      createJsonResponse({ error: 'invalid_grant', error_description: 'bad assertion' }, 400)
    );

    const authService = new AuthService({
      config: {
        tenantId: 'tenant',
        clientId: 'client',
        clientSecret: 'secret'
      },
      cache: new InMemoryTokenCache(),
      fetcher
    });

    await expect(authService.acquireOboToken('user', 'assertion', ['Calendars.Read'])).rejects.toThrow(
      'invalid_grant'
    );
  });

  it('acquires and caches client credential tokens', async () => {
    let callCount = 0;
    const fetcher = createFetcher(async () => {
      callCount += 1;
      return createJsonResponse({ access_token: 'app-token', expires_in: 3600 });
    });

    const authService = new AuthService({
      config: {
        tenantId: 'tenant',
        clientId: 'client',
        clientSecret: 'secret'
      },
      cache: new InMemoryTokenCache(),
      fetcher
    });

    const token1 = await authService.acquireClientCredentialToken(['https://graph.microsoft.com/.default']);
    const token2 = await authService.acquireClientCredentialToken(['https://graph.microsoft.com/.default']);

    expect(token1.token).toBe('app-token');
    expect(token2.token).toBe('app-token');
    expect(callCount).toBe(1);
  });
});
