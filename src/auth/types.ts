export interface AuthConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  authorityHost?: string;
}

export interface OboTokenRequest {
  userAssertion: string;
  scopes: string[];
}

export interface AccessToken {
  token: string;
  expiresAt: Date;
}

export interface TokenCacheKey {
  tenantId: string;
  userId: string;
  scopes: string[];
}

export interface TokenCache {
  get(key: TokenCacheKey): AccessToken | undefined;
  set(key: TokenCacheKey, token: AccessToken): void;
  delete(key: TokenCacheKey): void;
}
