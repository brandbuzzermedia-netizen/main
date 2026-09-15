/**
 * Runtime configuration. Everything is environment-driven; see .env.example and
 * docs/ENVIRONMENT.md. Nothing here holds a secret default.
 */

const int = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const bool = (v, fallback) => (v === undefined ? fallback : v === 'true' || v === '1');

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: int(process.env.PORT, 4000),
  baseUrl: process.env.BASE_URL ?? `http://localhost:${int(process.env.PORT, 4000)}`,

  session: {
    cookieName: 'sos_session',
    ttlMinutes: int(process.env.SESSION_TTL_MINUTES, 60 * 24 * 7),
  },

  ai: {
    provider: process.env.AI_PROVIDER ?? (process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'offline'),
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    model: process.env.AI_MODEL ?? 'claude-sonnet-5',
    heavyModel: process.env.AI_HEAVY_MODEL ?? 'claude-opus-5',
    maxTokens: int(process.env.AI_MAX_TOKENS, 2000),
    timeoutMs: int(process.env.AI_TIMEOUT_MS, 60_000),
  },

  worker: {
    pollMs: int(process.env.WORKER_POLL_MS, 2_000),
    concurrency: int(process.env.WORKER_CONCURRENCY, 4),
    id: process.env.WORKER_ID ?? `worker-${process.pid}`,
  },

  /** Default engagement recommendation thresholds (§12); overridable per client. */
  thresholds: {
    relevance: int(process.env.THRESHOLD_RELEVANCE, 80),
    brandFit: int(process.env.THRESHOLD_BRAND_FIT, 75),
    spamRisk: int(process.env.THRESHOLD_SPAM_RISK, 20),
    commentQuality: int(process.env.THRESHOLD_COMMENT_QUALITY, 75),
  },

  /**
   * Anti-spam ceilings (§43). These are OUR limits, deliberately well inside
   * each platform's own published rate limits — they are not an attempt to
   * discover or ride the platform ceiling.
   */
  limits: {
    commentsPerHourPerClient: int(process.env.LIMIT_COMMENTS_HOUR, 4),
    commentsPerDayPerClient: int(process.env.LIMIT_COMMENTS_DAY, 15),
    postsPerDayPerAccount: int(process.env.LIMIT_POSTS_DAY, 6),
    commentCooldownMinutes: int(process.env.LIMIT_COMMENT_COOLDOWN_MIN, 12),
    sameAuthorCooldownHours: int(process.env.LIMIT_SAME_AUTHOR_COOLDOWN_H, 72),
    similarityThreshold: Number(process.env.LIMIT_SIMILARITY ?? 0.82),
    apiRequestsPerMinute: int(process.env.LIMIT_API_RPM, 120),
  },

  research: {
    enabled: bool(process.env.RESEARCH_ENABLED, true),
    trendIntervalMinutes: int(process.env.JOB_TREND_INTERVAL_MIN, 30),
    engagementIntervalMinutes: int(process.env.JOB_ENGAGEMENT_INTERVAL_MIN, 120),
    briefHourUtc: int(process.env.JOB_BRIEF_HOUR_UTC, 2),
  },
};

/** Fails fast at boot rather than at the first credential write. */
export function assertProductionConfig() {
  const missing = [];
  if (!process.env.CREDENTIAL_ENCRYPTION_KEY) missing.push('CREDENTIAL_ENCRYPTION_KEY');
  if (config.env === 'production') {
    if (!process.env.BASE_URL) missing.push('BASE_URL');
    if (!process.env.DATABASE_URL && !process.env.DATABASE_FILE) missing.push('DATABASE_URL');
  }
  if (missing.length) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  }
}
