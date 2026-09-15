import { PlatformAdapter } from './adapter.js';
import { ManualActionRequired } from '../core/errors.js';

const GRAPH = process.env.META_GRAPH_BASE ?? 'https://graph.facebook.com/v21.0';

/** Shared Meta Graph plumbing for the Instagram and Facebook adapters. */
export class MetaAdapter extends PlatformAdapter {
  static authBase = 'https://www.facebook.com/v21.0/dialog/oauth';

  authorizeUrl({ state, redirectUri }) {
    const clientId = process.env.META_APP_ID;
    if (!clientId) throw new ManualActionRequired(this.platform, 'META_APP_ID is not configured.');
    const url = new URL(/** @type {any} */ (this.constructor).authBase);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', /** @type {any} */ (this.constructor).requiredScopes.join(','));
    return url.toString();
  }

  async exchangeCode({ code, redirectUri }) {
    const url = new URL(`${GRAPH}/oauth/access_token`);
    url.searchParams.set('client_id', process.env.META_APP_ID ?? '');
    url.searchParams.set('client_secret', process.env.META_APP_SECRET ?? '');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('code', code);
    const body = await this.http(url.toString());
    return {
      accessToken: body.access_token,
      refreshToken: null,
      expiresAt: body.expires_in ? new Date(Date.now() + body.expires_in * 1000).toISOString() : null,
      scopes: /** @type {any} */ (this.constructor).requiredScopes,
    };
  }

  async verify(creds) {
    const body = await this.http(`${GRAPH}/me?fields=id,name&access_token=${encodeURIComponent(creds.accessToken)}`);
    return { ok: Boolean(body?.id), handle: body?.name, detail: body?.id };
  }

  /** @param {string} path @param {Record<string,string>} params @param {string} token */
  async graphPost(path, params, token) {
    const form = new URLSearchParams({ ...params, access_token: token });
    return this.http(`${GRAPH}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
  }

  async graphGet(path, params, token) {
    const url = new URL(`${GRAPH}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('access_token', token);
    return this.http(url.toString());
  }
}

export { GRAPH };
