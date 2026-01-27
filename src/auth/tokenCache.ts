import { AccessToken, TokenCache, TokenCacheKey } from './types.js';

const serializeKey = (key: TokenCacheKey): string => {
  const scopes = [...key.scopes].sort().join(' ');
  return `${key.tenantId}:${key.userId}:${scopes}`;
};

export class InMemoryTokenCache implements TokenCache {
  private readonly store = new Map<string, AccessToken>();

  get(key: TokenCacheKey): AccessToken | undefined {
    const cached = this.store.get(serializeKey(key));
    if (!cached) {
      return undefined;
    }
    if (cached.expiresAt.getTime() <= Date.now()) {
      this.store.delete(serializeKey(key));
      return undefined;
    }
    return cached;
  }

  set(key: TokenCacheKey, token: AccessToken): void {
    this.store.set(serializeKey(key), token);
  }

  delete(key: TokenCacheKey): void {
    this.store.delete(serializeKey(key));
  }
}
