import { AppError, ManualActionRequired, TransientError } from '../core/errors.js';
import { log } from '../core/logger.js';

/**
 * PlatformAdapter — the contract every platform integration implements (§2).
 *
 * Three rules hold for every adapter, without exception:
 *
 *  1. Official APIs only. An adapter calls documented, officially supported
 *     endpoints with credentials the account owner granted through OAuth.
 *  2. If an operation is not officially supported, the adapter raises
 *     ManualActionRequired. It never invents a workaround — no scraping of
 *     protected surfaces, no automating a logged-in browser session, no
 *     CAPTCHA handling, no unofficial endpoints.
 *  3. Rate limits are respected as published. A 429 is backed off, never
 *     routed around.
 *
 * Adding a platform means subclassing this and registering it — nothing else in
 * the system needs to change.
 */

/**
 * @typedef {'image'|'carousel'|'reel'|'short_video'|'long_video'|'story'|'text'|'link'|'document'} ContentType
 * @typedef {{
 *   publish: ContentType[],
 *   comment: boolean,
 *   readPublicSearch: boolean,
 *   readOwnInsights: boolean,
 *   readMentions: boolean,
 *   scheduleNatively: boolean,
 *   notes?: Record<string, string>,
 * }} Capabilities
 * @typedef {{ accessToken:string, refreshToken?:string|null, externalId?:string|null, scopes?:string[] }} Credentials
 * @typedef {{ externalId:string, url:string|null, publishedAt:string, raw?:unknown }} PublishResult
 */

export class PlatformAdapter {
  /** @type {string} */
  static platform = 'unknown';
  /** @type {string} */
  static displayName = 'Unknown';
  /** OAuth scopes this adapter needs; surfaced on the connection screen. */
  static requiredScopes = [];
  /** @type {Capabilities} */
  static capabilities = {
    publish: [], comment: false, readPublicSearch: false,
    readOwnInsights: false, readMentions: false, scheduleNatively: false,
  };

  get platform() { return /** @type {typeof PlatformAdapter} */ (this.constructor).platform; }
  get capabilities() { return /** @type {typeof PlatformAdapter} */ (this.constructor).capabilities; }

  /**
   * Can this platform publish this content type through its official API right
   * now? Checked before scheduling *and* again immediately before publishing
   * (§20), because platform capabilities change under us.
   * @param {ContentType} contentType
   */
  supportsPublishing(contentType) {
    return this.capabilities.publish.includes(contentType);
  }

  /** @param {ContentType} contentType */
  assertCanPublish(contentType) {
    if (!this.supportsPublishing(contentType)) {
      const note = this.capabilities.notes?.[contentType];
      throw new ManualActionRequired(
        this.platform,
        `${/** @type {any} */ (this.constructor).displayName} does not offer official API publishing for "${contentType}".`,
        note ?? 'Publish this item manually in the platform’s own app, then mark it published here.',
      );
    }
  }

  // --- OAuth -----------------------------------------------------------------
  /**
   * Build the platform's authorisation URL. Adapters never handle passwords.
   * @param {{state:string, redirectUri:string, codeChallenge?:string}} _args
   * @returns {string}
   */
  authorizeUrl(_args) {
    throw new ManualActionRequired(this.platform, `${this.platform} OAuth is not configured on this deployment.`);
  }

  /**
   * Exchange an authorisation code for tokens.
   * @param {{code:string, redirectUri:string, codeVerifier?:string}} _args
   * @returns {Promise<Credentials & {expiresAt?:string|null, handle?:string, displayName?:string}>}
   */
  async exchangeCode(_args) {
    throw new ManualActionRequired(this.platform, `${this.platform} OAuth is not configured on this deployment.`);
  }

  /** @param {Credentials} _creds */
  async refresh(_creds) {
    throw new ManualActionRequired(this.platform, `${this.platform} does not support programmatic token refresh.`);
  }

  /**
   * Cheap liveness probe used by the connection page.
   * @param {Credentials} _creds
   * @returns {Promise<{ok:boolean, handle?:string, detail?:string}>}
   */
  async verify(_creds) {
    return { ok: false, detail: 'Not implemented' };
  }

  // --- publishing ------------------------------------------------------------
  /**
   * @param {Credentials} _creds
   * @param {{contentType:ContentType, caption?:string, media?:{url:string,type:string,alt?:string}[],
   *          hashtags?:string[], linkUrl?:string, title?:string, extra?:Record<string,unknown>}} draft
   * @returns {Promise<PublishResult>}
   */
  async publish(_creds, draft) {
    this.assertCanPublish(draft.contentType);
    throw new ManualActionRequired(this.platform, `Publishing is not implemented for ${this.platform}.`);
  }

  /**
   * @param {Credentials} _creds
   * @param {{targetId:string, body:string}} _comment
   * @returns {Promise<PublishResult>}
   */
  async publishComment(_creds, _comment) {
    if (!this.capabilities.comment) {
      throw new ManualActionRequired(
        this.platform,
        `${this.platform} does not offer official API commenting for this account type.`,
        'Reply manually from the platform, then record the outcome here.',
      );
    }
    throw new ManualActionRequired(this.platform, `Commenting is not implemented for ${this.platform}.`);
  }

  // --- research --------------------------------------------------------------
  /**
   * Search public conversations through the platform's own search API.
   * Returns [] when the platform offers no such API — never a scraped result.
   * @param {Credentials|null} _creds
   * @param {{query:string, limit?:number, since?:string}} _args
   * @returns {Promise<Array<Record<string, any>>>}
   */
  async searchPublic(_creds, _args) {
    return [];
  }

  /**
   * @param {Credentials} _creds
   * @param {{externalIds?:string[], since?:string}} _args
   * @returns {Promise<Array<Record<string, any>>>}
   */
  async fetchInsights(_creds, _args) {
    return [];
  }

  // --- shared HTTP -----------------------------------------------------------
  /**
   * All platform HTTP goes through here so retry classification, rate-limit
   * handling and logging are identical everywhere.
   * @param {string} url
   * @param {RequestInit & {timeoutMs?:number}} [init]
   */
  async http(url, init = {}) {
    const { timeoutMs = 20_000, ...rest } = init;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    try {
      const res = await fetch(url, { ...rest, signal: controller.signal });
      const text = await res.text();
      const body = text ? safeJson(text) : null;
      log.debug('platform_http', {
        platform: this.platform, status: res.status,
        host: new URL(url).host, ms: Date.now() - started,
      });

      if (res.status === 429) {
        // Respect the platform's own backoff signal. Never retry faster.
        const retryAfter = Number(res.headers.get('retry-after') ?? 60);
        throw new TransientError(`${this.platform} rate limited this request`, retryAfter);
      }
      if (res.status >= 500) {
        throw new TransientError(`${this.platform} returned ${res.status}`, 30);
      }
      if (!res.ok) {
        throw new AppError(res.status, 'platform_error',
          `${this.platform} rejected the request: ${describe(body) ?? res.statusText}`, { body });
      }
      return body;
    } catch (err) {
      if (err?.name === 'AbortError') throw new TransientError(`${this.platform} request timed out`, 30);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

function describe(body) {
  if (!body || typeof body !== 'object') return null;
  return body.error?.message ?? body.error_description ?? body.message ?? body.error ?? null;
}
