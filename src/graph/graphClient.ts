import { mapGraphError } from '../errors/index.js';

export interface GraphClientOptions {
  baseUrl?: string;
  tokenProvider: () => Promise<string>;
  fetcher?: typeof fetch;
  retry?: {
    maxAttempts: number;
    baseDelayMs: number;
  };
}

export class GraphClient {
  private readonly baseUrl: string;
  private readonly tokenProvider: () => Promise<string>;
  private readonly fetcher: typeof fetch;
  private readonly retryConfig?: GraphClientOptions['retry'];

  constructor(options: GraphClientOptions) {
    this.baseUrl = options.baseUrl ?? 'https://graph.microsoft.com/v1.0';
    this.tokenProvider = options.tokenProvider;
    this.fetcher = options.fetcher ?? fetch;
    this.retryConfig = options.retry;
  }

  async get<T>(path: string, query?: Record<string, string>): Promise<T> {
    return this.request<T>('GET', path, undefined, query);
  }

  async request<T>(method: string, path: string, body?: unknown, query?: Record<string, string>): Promise<T> {
    const url = this.buildUrl(path, query);
    const token = await this.tokenProvider();
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    return this.executeWithRetry<T>(url, init);
  }

  private buildUrl(path: string, query?: Record<string, string>): string {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      const url = new URL(path);
      if (query) {
        for (const [key, value] of Object.entries(query)) {
          url.searchParams.set(key, value);
        }
      }
      return url.toString();
    }
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${normalizedPath}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, value);
      }
    }
    return url.toString();
  }

  private async executeWithRetry<T>(url: string, init: RequestInit): Promise<T> {
    const retry = this.retryConfig;
    const attempts = retry?.maxAttempts ?? 1;
    const baseDelay = retry?.baseDelayMs ?? 250;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const response = await this.fetcher(url, init);
      if (response.ok) {
        return (await response.json()) as T;
      }

      if ((response.status === 429 || response.status === 503) && attempt < attempts) {
        const retryAfter = this.getRetryAfterSeconds(response);
        await this.delay((retryAfter ?? baseDelay / 1000) * 1000 * attempt);
        continue;
      }

      const errorPayload = (await response.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
      const message = errorPayload.error?.message ?? `Graph request failed (${response.status})`;
      const error = mapGraphError(response.status, message, errorPayload.error?.code);
      throw error;
    }

    throw new Error('Graph request retry loop exhausted.');
  }

  private getRetryAfterSeconds(response: Response): number | undefined {
    const header = response.headers.get('Retry-After');
    if (!header) {
      return undefined;
    }
    const value = Number(header);
    return Number.isFinite(value) ? value : undefined;
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
