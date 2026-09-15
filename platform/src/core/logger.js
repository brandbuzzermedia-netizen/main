/** Structured JSON logging — one event per line, greppable, no secrets. */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[process.env.LOG_LEVEL ?? 'info'] ?? 20;

const REDACT = /^(password|access_token|refresh_token|.*_enc|authorization|cookie|secret|api_key)$/i;

function scrub(value, depth = 0) {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = REDACT.test(k) ? '[redacted]' : scrub(v, depth + 1);
  }
  return out;
}

function emit(level, msg, fields) {
  if (LEVELS[level] < threshold) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...scrub(fields ?? {}) });
  if (level === 'error' || level === 'warn') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

export const log = {
  debug: (msg, fields) => emit('debug', msg, fields),
  info: (msg, fields) => emit('info', msg, fields),
  warn: (msg, fields) => emit('warn', msg, fields),
  error: (msg, fields) => emit('error', msg, fields),
  /** @param {Record<string, unknown>} base */
  child: (base) => ({
    debug: (m, f) => emit('debug', m, { ...base, ...f }),
    info: (m, f) => emit('info', m, { ...base, ...f }),
    warn: (m, f) => emit('warn', m, { ...base, ...f }),
    error: (m, f) => emit('error', m, { ...base, ...f }),
  }),
};
