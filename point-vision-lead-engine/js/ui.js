/* UI helpers: safe templating, icons, formatting, toasts, modals. */
(function () {
  'use strict';
  const RAW = '__raw';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const raw = (s) => ({ [RAW]: String(s) });
  const fmt = (v) => {
    if (v == null || v === false) return '';
    if (Array.isArray(v)) return v.map(fmt).join('');
    if (typeof v === 'object' && RAW in v) return v[RAW];
    return esc(String(v));
  };
  // html`<p>${userText}</p>` escapes every interpolation unless it is raw().
  function html(strings, ...vals) {
    let out = '';
    strings.forEach((s, i) => { out += s; if (i < vals.length) out += fmt(vals[i]); });
    return raw(out);
  }
  const toStr = (v) => fmt(v);

  const ICON_PATHS = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    research: '<path d="M4 19.5V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14.5"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5H6.5A2.5 2.5 0 0 0 4 19.5Z"/><path d="M8 7h8M8 11h6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    review: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    pipeline: '<rect x="3" y="3" width="5" height="18" rx="1.5"/><rect x="10" y="3" width="5" height="12" rx="1.5"/><rect x="17" y="3" width="4" height="8" rx="1.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
    intern: '<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
    founder: '<path d="M12 2 15 8l6 .9-4.5 4.3 1 6.3L12 16.6 6.5 19.5l1-6.3L3 8.9 9 8z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    ext: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    linkedin: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 10v7"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    arrowL: '<path d="m15 18-6-6 6-6"/>', arrowR: '<path d="m9 18 6-6-6-6"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/>'
  };
  const icon = (n) => raw(`<svg viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[n] || ''}</svg>`);

  /* Formatting */
  const E = () => window.PVEngine;
  function ago(iso) {
    if (!iso) return '';
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    const d = Math.floor(s / 86400);
    if (d < 7) return d + 'd ago';
    return shortDate(iso);
  }
  function shortDate(v) {
    if (!v) return '';
    const d = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T12:00:00') : new Date(v);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function dueLabel(key) {
    if (!key) return '';
    const today = E().dayKey(new Date());
    const diff = Math.round((new Date(key + 'T12:00:00') - new Date(today + 'T12:00:00')) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff < 0) return `${-diff}d overdue`;
    return 'In ' + diff + 'd';
  }
  const initials = (l) => ((l.firstName || '?')[0] + (l.lastName || '')[0] || '').toUpperCase();

  const STATUS_COLOR = {
    new: '', researching: 'b-blue', researchComplete: 'b-blue', drafted: 'b-violet', review: 'b-amber', approved: 'b-green',
    sent: 'b-dark', connected: 'b-dark', replied: 'b-coral', positive: 'b-green', meeting: 'b-green', qualified: 'b-green',
    proposal: 'b-green', won: 'b-green', lost: 'b-red', notInterested: 'b-red'
  };
  const statusBadge = (s) => html`<span class="badge dot ${STATUS_COLOR[s] || ''}">${(E().STAGE_BY_KEY[s] || { label: s }).label}</span>`;
  const EMAIL_COLOR = { Valid: 'b-green', Risky: 'b-amber', 'Catch-all': 'b-amber', Invalid: 'b-red', 'Not Found': 'b-red', Unverified: '' };
  const emailBadge = (s) => html`<span class="badge ${EMAIL_COLOR[s] || ''}">${s || 'Unverified'}</span>`;
  const scoreBadge = (sc, lg) => html`<span class="score ${sc.priority.key} ${lg ? 'lg' : ''}" title="${sc.priority.label}${sc.overridden ? ' (manual score)' : ''}">${sc.total}</span>`;
  const priorityBadge = (sc) => html`<span class="badge ${sc.priority.key === 'high' ? 'b-green' : sc.priority.key === 'medium' ? 'b-amber' : ''}">${sc.priority.label}</span>`;
  const confBadge = (c) => html`<span class="badge ${c === 'High' ? 'b-green' : c === 'Medium' ? 'b-amber' : ''}">${c} confidence</span>`;
  const notFound = (v) => (v && String(v).trim() ? v : raw('<span class="notfound">Not Found</span>'));

  /* Toasts */
  function toast(msg, kind) {
    let box = document.querySelector('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast' + (kind === 'err' ? ' err' : '');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (_) { /* ignore */ }
      ta.remove();
    }
    toast((label || 'Copied') + ' to clipboard');
  }

  /* Modal: drawer (side) or dialog (centre). Returns the root element. */
  function modal(content, opts) {
    opts = opts || {};
    closeModal();
    const ov = document.createElement('div');
    ov.className = 'overlay' + (opts.center ? ' center' : '');
    ov.innerHTML = `<div class="${opts.center ? 'dialog' : 'drawer'}" role="dialog" aria-modal="true">${toStr(content)}</div>`;
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) closeModal(); });
    document.body.appendChild(ov);
    const first = ov.querySelector('[autofocus], input, textarea, select');
    if (first) setTimeout(() => first.focus(), 30);
    return ov;
  }
  function closeModal() { document.querySelectorAll('.overlay').forEach((o) => o.remove()); }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  function confirmBox(title, body, okLabel, onOk, danger) {
    const ov = modal(html`<div class="mh"><h2>${title}</h2><button class="x-btn" data-action="close-modal" aria-label="Close">×</button></div>
      <div class="mb"><p class="muted">${body}</p></div>
      <div class="mf"><button class="btn" data-action="close-modal">Cancel</button><button class="btn ${danger ? 'danger' : 'dark'}" id="confirm-ok">${okLabel}</button></div>`, { center: true });
    ov.querySelector('#confirm-ok').addEventListener('click', () => { closeModal(); onOk(); });
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type: type || 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  window.PVUI = { html, raw, esc, toStr, icon, ago, shortDate, dueLabel, initials, statusBadge, emailBadge, scoreBadge, priorityBadge, confBadge, notFound, toast, copy, modal, closeModal, confirmBox, download, STATUS_COLOR };
})();
