import { InstagramAdapter } from './instagram.js';
import { FacebookAdapter } from './facebook.js';
import { LinkedInAdapter } from './linkedin.js';
import { XAdapter } from './x.js';
import { RedditAdapter } from './reddit.js';
import { QuoraAdapter } from './quora.js';
import { ThreadsAdapter } from './threads.js';
import { YouTubeAdapter } from './youtube.js';
import { badRequest } from '../core/errors.js';

/**
 * Platform registry. Adding a platform is one import and one line here — the
 * rest of the system reads capabilities off the adapter rather than hard-coding
 * platform names.
 */
const CLASSES = [
  InstagramAdapter, FacebookAdapter, LinkedInAdapter, XAdapter,
  RedditAdapter, QuoraAdapter, ThreadsAdapter, YouTubeAdapter,
];

/** @type {Map<string, import('./adapter.js').PlatformAdapter>} */
const instances = new Map();
for (const Cls of CLASSES) instances.set(Cls.platform, new Cls());

export const PLATFORMS = CLASSES.map((c) => c.platform);

/** @param {string} platform */
export function getAdapter(platform) {
  const adapter = instances.get(platform);
  if (!adapter) throw badRequest(`Unknown platform "${platform}"`, { supported: PLATFORMS });
  return adapter;
}

/** Capability matrix for the UI and for pre-scheduling validation (§20). */
export function capabilityMatrix() {
  return CLASSES.map((Cls) => ({
    platform: Cls.platform,
    display_name: Cls.displayName,
    required_scopes: Cls.requiredScopes,
    capabilities: Cls.capabilities,
    oauth_configured: isOAuthConfigured(Cls.platform),
  }));
}

/** Which platforms this deployment actually has app credentials for. */
export function isOAuthConfigured(platform) {
  const env = process.env;
  switch (platform) {
    case 'instagram':
    case 'facebook': return Boolean(env.META_APP_ID && env.META_APP_SECRET);
    case 'linkedin': return Boolean(env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET);
    case 'x': return Boolean(env.X_CLIENT_ID && env.X_CLIENT_SECRET);
    case 'reddit': return Boolean(env.REDDIT_CLIENT_ID && env.REDDIT_CLIENT_SECRET);
    case 'threads': return Boolean(env.THREADS_APP_ID && env.THREADS_APP_SECRET);
    case 'youtube': return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
    case 'quora': return false; // no official write API exists
    default: return false;
  }
}

export {
  InstagramAdapter, FacebookAdapter, LinkedInAdapter, XAdapter,
  RedditAdapter, QuoraAdapter, ThreadsAdapter, YouTubeAdapter,
};
