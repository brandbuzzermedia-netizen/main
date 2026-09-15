/** Application error carrying an HTTP status and a machine-readable code. */
export class AppError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message
   * @param {Record<string, unknown>} [details]
   */
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new AppError(400, 'bad_request', msg, details);
export const unauthorized = (msg = 'Authentication required') => new AppError(401, 'unauthorized', msg);
export const forbidden = (msg = 'Not permitted') => new AppError(403, 'forbidden', msg);
export const notFound = (msg = 'Not found') => new AppError(404, 'not_found', msg);
export const conflict = (msg, details) => new AppError(409, 'conflict', msg, details);
export const tooMany = (msg, details) => new AppError(429, 'rate_limited', msg, details);
export const serverError = (msg = 'Internal error') => new AppError(500, 'internal_error', msg);

/**
 * Raised when a platform cannot perform an operation through its official API.
 * The system never works around this — it surfaces MANUAL_ACTION_REQUIRED.
 */
export class ManualActionRequired extends AppError {
  /** @param {string} platform @param {string} reason @param {string} [howTo] */
  constructor(platform, reason, howTo) {
    super(422, 'manual_action_required', reason);
    this.name = 'ManualActionRequired';
    this.platform = platform;
    this.howTo = howTo;
  }
}

/** Retryable failures (network blips, 5xx, throttling) vs permanent ones. */
export class TransientError extends AppError {
  constructor(message, retryAfterSeconds) {
    super(503, 'transient', message);
    this.name = 'TransientError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
