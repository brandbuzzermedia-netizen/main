/* App shell: routing, navigation, data binding and shared lead actions.
   Views live in js/views/*.js and register themselves on PV.views. */
(function () {
  'use strict';
  const E = window.PVEngine;
  const S = window.PVStore;
  const U = window.PVUI;
  const { html, raw, icon } = U;

  const PREFS_KEY = 'pvle:prefs';
  let prefs = {};
  try { prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch (e) { prefs = {}; }

  const PV = window.PV = {
    E, S, U, views: {}, actions: {}, live: {},
    prefs,
    savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ } },
    get settings() { return S.settings; },
    get leads() { return S.leads; },
    lead: (id) => S.lead(id),
    score: (l) => E.scoreLead(l, S.settings),
    today: () => E.dayKey(new Date()),
    target: () => Number(S.settings.outreach.dailyTarget) || 15
  };

  /* ---------------- Navigation ---------------- */

  const NAV = [
    { group: 'Workspaces', items: [
      { id: 'intern', label: 'Intern Workspace', icon: 'intern' },
      { id: 'founder', label: 'Founder Workspace', icon: 'founder' }
    ] },
    { group: 'Outbound', items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
      { id: 'finder', label: 'Lead Finder', icon: 'search' },
      { id: 'leads', label: 'Leads', icon: 'users' },
      { id: 'research', label: 'Research', icon: 'research' },
      { id: 'email', label: 'Email Generator', icon: 'mail' },
      { id: 'review', label: 'Founder Review', icon: 'review', count: () => S.leads.filter((l) => l.status === 'review').length },
      { id: 'pipeline', label: 'Pipeline', icon: 'pipeline' },
      { id: 'followups', label: 'Follow-ups', icon: 'clock', count: () => PV.followupsDue().length },
      { id: 'analytics', label: 'Analytics', icon: 'chart' }
    ] },
    { group: '', items: [{ id: 'settings', label: 'Settings', icon: 'settings' }] }
  ];
  const TITLES = { lead: 'Lead' };
  NAV.forEach((g) => g.items.forEach((i) => { TITLES[i.id] = i.label; }));

  function route() {
    const h = location.hash.replace(/^#\/?/, '');
    const [path, query] = h.split('?');
    const parts = path.split('/').filter(Boolean);
    const params = {};
    new URLSearchParams(query || '').forEach((v, k) => { params[k] = v; });
    return { name: parts[0] || (prefs.role === 'founder' ? 'founder' : prefs.role === 'intern' ? 'intern' : 'dashboard'), id: parts[1] || params.id || null, sub: parts[2] || null, params };
  }
  PV.go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };

  function shell() {
    const r = route();
    const active = r.name === 'lead' ? 'leads' : r.name;
    const role = prefs.role || 'founder';
    return html`<div class="app">
      <aside class="side" aria-label="Main navigation">
        <a class="brand" href="#/dashboard"><img src="assets/logo-icon.png" alt=""><div><b>Point Vision</b><span>Lead Engine</span></div></a>
        ${NAV.map((g) => html`<div class="nav-group">${g.group ? html`<div class="nav-label">${g.group}</div>` : ''}<nav class="nav">
          ${g.items.map((i) => { const c = i.count ? i.count() : 0; return html`<a href="#/${i.id}" class="${active === i.id ? 'on' : ''}">${icon(i.icon)}${i.label}${c ? html`<span class="count">${c}</span>` : ''}</a>`; })}
        </nav></div>`)}
        <div class="side-foot" id="sync-status">${syncStatus()}</div>
      </aside>
      <div class="main">
        <header class="top">
          <button class="btn sm ghost menu-btn" data-action="nav-toggle" aria-label="Open menu">${icon('menu')}</button>
          <div class="crumb">${TITLES[r.name] || ''}</div>
          <div class="spacer"></div>
          <div class="role-switch hide-sm" role="group" aria-label="View as">
            <button class="${role === 'intern' ? 'on' : ''}" data-action="set-role" data-role="intern">Intern</button>
            <button class="${role === 'founder' ? 'on' : ''}" data-action="set-role" data-role="founder">Founder</button>
          </div>
          <button class="btn primary" data-action="add-lead">${icon('plus')}<span class="hide-sm">Add lead</span></button>
        </header>
        <main class="page" id="page"></main>
      </div>
    </div>`;
  }

  function syncStatus() {
    if (S.mode === 'server') {
      return html`<span class="dot ${S.online ? 'ok' : ''}"></span>${S.online ? 'Shared workspace · synced' : 'Shared workspace · offline, saving locally'}${S.lastSync ? html`<br><span class="faint">Last sync ${U.ago(S.lastSync.toISOString())}</span>` : ''}`;
    }
    return html`<span class="dot ok"></span>Saved in this browser<br><span class="faint">Run server.js to share with the team</span>`;
  }

  let renderPending = false;
  function render() {
    const r = route();
    document.body.classList.remove('nav-open');
    const app = document.getElementById('app');
    const scrollY = window.scrollY;
    const keepScroll = render._last === location.hash;
    render._last = location.hash;
    app.innerHTML = U.toStr(shell());
    const view = PV.views[r.name] || PV.views.dashboard;
    const page = document.getElementById('page');
    try {
      page.innerHTML = U.toStr(view.render(r));
      if (view.mount) view.mount(page, r);
    } catch (e) {
      console.error(e);
      page.innerHTML = U.toStr(html`<div class="card"><div class="empty"><h3>Something went wrong rendering this page</h3><p>${e.message}</p></div></div>`);
    }
    document.title = (TITLES[r.name] || 'Point Vision') + ' · Point Vision Lead Engine';
    if (keepScroll) window.scrollTo(0, scrollY); else window.scrollTo(0, 0);
    renderPending = false;
  }
  PV.render = render;

  function refreshLive() {
    document.querySelectorAll('[data-live]').forEach((el) => {
      const fn = PV.live[el.dataset.live];
      if (fn) el.innerHTML = U.toStr(fn(el));
    });
  }
  PV.refreshLive = refreshLive;

  /* ---------------- Lead operations ---------------- */

  const MILESTONE_LABEL = {
    added: 'Lead added', verified: 'Email verification recorded', researchStarted: 'Research started', researched: 'Research completed', drafted: 'Email drafted',
    submitted: 'Submitted for founder review', approved: 'Approved by founder', sent: 'Email sent (manually)',
    linkedinRequested: 'LinkedIn request sent', connected: 'LinkedIn connected', replied: 'Replied', positive: 'Positive reply',
    meeting: 'Meeting booked', qualified: 'Qualified', proposal: 'Proposal sent', won: 'Won', lost: 'Lost', notInterested: 'Not interested'
  };

  PV.log = (lead, text) => { (lead.activity = lead.activity || []).push({ at: new Date().toISOString(), text }); };
  PV.stamp = (lead, key) => {
    lead.milestones = lead.milestones || {};
    if (!lead.milestones[key]) { lead.milestones[key] = new Date().toISOString(); PV.log(lead, MILESTONE_LABEL[key] || key); }
  };

  PV.mutate = (id, fn, opts) => {
    const lead = S.lead(id);
    if (!lead) return null;
    fn(lead);
    S.saveLead(lead, opts);
    return lead;
  };

  PV.setStatus = (id, status, opts) => PV.mutate(id, (l) => {
    const stage = E.STAGE_BY_KEY[status];
    if (!stage || l.status === status) return;
    const from = l.status;
    l.status = status;
    PV.stamp(l, stage.milestone);
    if (status === 'sent') l.linkedinChecklist.emailSent = true;
    if (status === 'connected') { l.linkedinChecklist.connected = true; l.linkedinChecklist.requestSent = true; PV.stamp(l, 'linkedinRequested'); }
    if (status === 'replied') l.linkedinChecklist.replied = true;
    if (['researching', 'researchComplete', 'drafted'].includes(status) && E.STAGE_BY_KEY[from] && E.STAGE_BY_KEY[from].index > E.STAGE_BY_KEY[status].index) {
      PV.log(l, `Moved back to ${stage.label}`);
    }
    if (opts && opts.note) PV.log(l, opts.note);
  }, opts);

  PV.followupsDue = () => {
    const today = PV.today();
    return S.leads.map((l) => ({ lead: l, fu: E.nextFollowUp(l, S.settings) })).filter((x) => x.fu && x.fu.due <= today);
  };

  PV.leadName = (l) => E.fullName(l) || 'Unnamed lead';

  // Shared "who is this" header used across pages.
  PV.whoLine = (l) => html`<div class="row"><span class="avatar">${U.initials(l)}</span><div class="grow"><div class="ttl">${PV.leadName(l)}</div><div class="meta">${l.title || 'No title'} · ${l.company || 'No company'}</div></div></div>`;

  /* ---------------- Binding ---------------- */

  function setPath(obj, path, value) {
    const keys = path.split('.');
    let o = obj;
    keys.slice(0, -1).forEach((k) => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
    o[keys[keys.length - 1]] = value;
  }
  function getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj); }
  PV.getPath = getPath; PV.setPath = setPath;

  function readValue(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.dataset.lines !== undefined) return el.value.split('\n').map((s) => s.trim()).filter(Boolean);
    if (el.dataset.num !== undefined) return el.value === '' ? null : Number(el.value);
    return el.value;
  }

  let saveTimer = null;
  function onBind(e) {
    const el = e.target;
    if (el.dataset.f !== undefined) {
      const host = el.closest('[data-lead]');
      if (!host) return;
      const id = host.dataset.lead;
      const lead = S.lead(id);
      if (!lead) return;
      setPath(lead, el.dataset.f, readValue(el));
      if (el.dataset.f === 'emailStatus' && el.value !== 'Unverified') PV.stamp(lead, 'verified');
      if (lead.status === 'new' && el.dataset.f.startsWith('research.') && E.has(el.value)) { lead.status = 'researching'; PV.stamp(lead, 'researchStarted'); }
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => S.saveLead(lead, { silent: true }), 250);
      lead.updatedAt = new Date().toISOString();
      refreshLive();
      if (e.type === 'change' && el.dataset.rerender !== undefined) { S.saveLead(lead, { silent: true }); render(); }
    } else if (el.dataset.s !== undefined) {
      setPath(S.settings, el.dataset.s, readValue(el));
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => S.saveSettings({ silent: true }), 300);
      refreshLive();
      if (e.type === 'change' && el.dataset.rerender !== undefined) { S.saveSettings({ silent: true }); render(); }
    }
  }

  /* ---------------- Global actions ---------------- */

  Object.assign(PV.actions, {
    'close-modal': () => U.closeModal(),
    'nav-toggle': () => document.body.classList.toggle('nav-open'),
    'set-role': (el) => { prefs.role = el.dataset.role; PV.savePrefs(); PV.go('#/' + prefs.role); },
    'go': (el) => PV.go(el.dataset.href),
    'copy': (el) => {
      const src = el.dataset.from ? document.querySelector(el.dataset.from) : null;
      const text = src ? (src.value !== undefined && src.tagName !== 'DIV' ? src.value : src.innerText) : el.dataset.text;
      U.copy(text || '', el.dataset.label);
    },
    'status': (el) => {
      PV.setStatus(el.dataset.id, el.dataset.to);
      U.toast(`Moved to ${E.STAGE_BY_KEY[el.dataset.to].label}`);
    }
  });

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]');
    if (a) {
      const fn = PV.actions[a.dataset.action];
      if (fn) { if (a.type !== 'checkbox') e.preventDefault(); fn(a, e); }
      return;
    }
    const row = e.target.closest('[data-href]');
    if (row && !e.target.closest('a, button, input, select, textarea, label')) PV.go(row.dataset.href);
  });
  document.addEventListener('input', onBind);
  document.addEventListener('change', (e) => {
    onBind(e);
    const a = e.target.closest('[data-onchange]');
    if (a && PV.actions[a.dataset.onchange]) PV.actions[a.dataset.onchange](a, e);
  });
  document.addEventListener('focusout', () => { if (renderPending) setTimeout(() => { if (!isEditing()) render(); }, 50); });

  function isEditing() {
    const a = document.activeElement;
    return a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.closest('#page, .overlay');
  }

  window.addEventListener('hashchange', render);

  S.on((source) => {
    if (source === 'status') { const el = document.getElementById('sync-status'); if (el) el.innerHTML = U.toStr(syncStatus()); return; }
    if (source === 'remote' && (isEditing() || document.querySelector('.overlay'))) { renderPending = true; return; }
    render();
  });

  // Wait for every view script to register before the first render.
  document.addEventListener('DOMContentLoaded', () => S.init().then(() => {
    if (!location.hash) location.replace('#/' + (prefs.role || 'dashboard'));
    render();
  }));
})();
