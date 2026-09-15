/** Shared helpers: DOM building, API access, formatting, toasts. */

/** Tiny hyperscript. `h('div.card', {onclick}, ...children)` */
export function h(spec, props = null, ...children) {
  const [tag, ...classes] = String(spec).split('.');
  const el = document.createElement(tag || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (props && (typeof props !== 'object' || Array.isArray(props) || props instanceof Node)) {
    children.unshift(props);
    props = null;
  }
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = `${el.className} ${value}`.trim();
    else if (key === 'html') el.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key in el && key !== 'list') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(3)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

/** Replace an element's contents. */
export function fill(el, ...children) {
  el.replaceChildren(...children.flat(3).filter((c) => c != null && c !== false)
    .map((c) => (c instanceof Node ? c : document.createTextNode(String(c)))));
  return el;
}

// ------------------------------------------------------------------ API ----
export class ApiError extends Error {
  constructor(status, payload) {
    super(payload?.error?.message ?? `Request failed (${status})`);
    this.status = status;
    this.code = payload?.error?.code;
    this.details = payload?.error?.details;
    this.manualAction = payload?.error?.status === 'MANUAL_ACTION_REQUIRED' ? payload.error : null;
  }
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  const res = await fetch(path, {
    method,
    signal,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, payload);
  return payload;
}

// ------------------------------------------------------------- formatting --
export const fmt = {
  number(n) {
    const v = Number(n ?? 0);
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return String(Math.round(v));
  },
  percent(n, digits = 1) { return `${(Number(n ?? 0) * 100).toFixed(digits)}%`; },
  date(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  },
  dateTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString(undefined, {
      day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
    });
  },
  relative(iso) {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.round(diff / 60_000);
    if (Math.abs(mins) < 60) return mins <= 0 ? 'just now' : `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (Math.abs(hours) < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
  },
  title(s) {
    return String(s ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  },
};

export const PLATFORM_LABEL = {
  instagram: 'Instagram', facebook: 'Facebook', linkedin: 'LinkedIn', x: 'X',
  reddit: 'Reddit', quora: 'Quora', threads: 'Threads', youtube: 'YouTube',
};

// ------------------------------------------------------------- primitives --
export function scoreChip(value, label) {
  const v = Number(value ?? 0);
  const tone = v >= 85 ? 'hot' : v >= 65 ? 'warm' : 'cool';
  return h(`div.score.${tone}`, { title: label ?? `${v}/100` }, String(v));
}

export function pill(text, tone = '') {
  return h(`span.pill${tone ? `.${tone}` : ''}`, text);
}

/** Status colour mapping shared by the calendar, approvals and publishing log. */
export function statusPill(status) {
  const tone = {
    PUBLISHED: 'ok', APPROVED: 'ok', approved: 'ok', succeeded: 'ok', connected: 'ok',
    IN_REVIEW: 'warn', pending: 'warn', SCHEDULED: 'info', PUBLISHING: 'info', queued: 'info',
    MANUAL_ACTION_REQUIRED: 'warn', expired: 'warn', expiring_soon: 'warn',
    FAILED: 'bad', failed: 'bad', dead_letter: 'bad', rejected: 'bad', blocked: 'bad',
    disconnected: 'bad', error: 'bad',
  }[status] ?? '';
  return pill(fmt.title(status), tone);
}

export function empty({ icon = '∅', title, body, action }) {
  return h('div.empty',
    h('span.empty-icon', icon),
    h('h3', title),
    body && h('p', body),
    action);
}

export function loading(rows = 3) {
  return h('div.card', h('div.stack',
    ...Array.from({ length: rows }, (_, i) =>
      h('div.skeleton', { style: `width:${100 - i * 12}%` }))));
}

export function errorState(err, retry) {
  return h('div.error-state',
    h('h3', 'Something went wrong'),
    h('p', err?.message ?? String(err)),
    retry && h('button.btn', { onclick: retry }, 'Try again'));
}

export function toast(message, tone = '') {
  const el = h(`div.toast${tone ? `.${tone}` : ''}`, message);
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), 5200);
}

/** Right-hand drawer used for detail views. Returns a close function. */
export function drawer(title, ...content) {
  const close = () => backdrop.remove();
  const backdrop = h('div.drawer-backdrop', {
    onclick: (e) => { if (e.target === backdrop) close(); },
  },
    h('div.drawer',
      h('div.drawer-head',
        h('h2', title),
        h('button.btn.sm', { onclick: close }, 'Close')),
      ...content));
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
  });
  document.body.append(backdrop);
  return close;
}

/** Render check results from the quality checker or the safety gate. */
export function checkList(checks) {
  return h('div.checks',
    ...Object.entries(checks ?? {}).map(([name, result]) =>
      h(`div.check.${result.pass ? 'pass' : 'fail'}`,
        h('span.mark', result.pass ? '✓' : '✗'),
        h('span', h('strong', fmt.title(name)),
          result.pass ? null : h('span.detail', ` — ${result.detail}`)))));
}

/** Run an async action with button feedback. */
export async function withBusy(button, label, fn) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = label;
  try {
    return await fn();
  } catch (err) {
    toast(err.message ?? String(err), 'bad');
    throw err;
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}
