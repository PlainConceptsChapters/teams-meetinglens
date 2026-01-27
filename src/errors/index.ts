export class AuthError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'AuthError';
    this.cause = cause;
  }
}

export class PermissionDeniedError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'PermissionDeniedError';
    this.cause = cause;
  }
}

export class ThrottledError extends Error {
  readonly retryAfterSeconds?: number;
  readonly cause?: unknown;

  constructor(message: string, retryAfterSeconds?: number, cause?: unknown) {
    super(message);
    this.name = 'ThrottledError';
    this.retryAfterSeconds = retryAfterSeconds;
    this.cause = cause;
  }
}

export class NotFoundError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'NotFoundError';
    this.cause = cause;
  }
}

export class InvalidRequestError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'InvalidRequestError';
    this.cause = cause;
  }
}

export class GraphError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly cause?: unknown;

  constructor(message: string, status: number, code?: string, cause?: unknown) {
    super(message);
    this.name = 'GraphError';
    this.status = status;
    this.code = code;
    this.cause = cause;
  }
}

export const mapGraphError = (status: number, message: string, code?: string): Error => {
  if (status === 401 || status === 403) {
    return new PermissionDeniedError(message);
  }
  if (status === 404) {
    return new NotFoundError(message);
  }
  if (status === 429 || status === 503) {
    return new ThrottledError(message);
  }
  if (status >= 400 && status < 500) {
    return new InvalidRequestError(message);
  }
  return new GraphError(message, status, code);
};
