import { h, fill, api, fmt, pill, empty, toast, drawer, PLATFORM_LABEL, withBusy } from './lib.js';
import * as v1 from './views.js';
import * as v2 from './views2.js';
import * as v3 from './views3.js';
import * as v4 from './views4.js';

/**
 * App shell: authentication, the sidebar, the client selector, global search,
 * notifications, the emergency stop, and hash routing.
 */

const ROUTES = [
  { path: '/dashboard', icon: '▦', view: v1.dashboard, group: null },
  { path: '/clients', icon: '👥', view: v1.clients, group: null },
  { path: '/client', icon: '★', view: v1.client, label: 'Client Overview', group: 'Client' },
  { path: '/trends', icon: '🔥', view: v2.trends, group: 'Client' },
  { path: '/inspiration', icon: '🎬', view: v2.inspiration, group: 'Client' },
  { path: '/engagement', icon: '💬', view: v2.engagement, group: 'Client' },
  { path: '/ideas', icon: '💡', view: v3.ideas, group: 'Client' },
  { path: '/calendar', icon: '📅', view: v3.calendar, group: 'Client' },
  { path: '/publishing', icon: '🚀', view: v4.publishing, group: 'Client' },
  { path: '/competitors', icon: '👀', view: v4.competitors, group: 'Client' },
  { path: '/analytics', icon: '📊', view: v4.analytics, group: 'Client' },
  { path: '/approvals', icon: '✅', view: v3.approvals, group: 'Agency', badge: 'approvals' },
  { path: '/assistant', icon: '🤖', view: v4.assistant, group: 'Agency' },
  { path: '/accounts', icon: '🔌', view: v4.accounts, group: 'Agency' },
  { path: '/audit', icon: '📜', view: v4.audit, group: 'Agency' },
  { path: '/settings', icon: '⚙️', view: v4.settings, group: 'Agency' },
];

const state = {
  me: null,
  clients: [],
  clientId: localStorage.getItem('sos.client') ?? null,
  get clientName() { return this.clients.find((c) => c.id === this.clientId)?.name ?? 'this client'; },
  badges: { approvals: 0 },
  setClient(id) {
    this.clientId = id;
    if (id) localStorage.setItem('sos.client', id); else localStorage.removeItem('sos.client');
    renderShell();
    route();
  },
};

const root = document.getElementById('root');

// ---------------------------------------------------------------- bootstrap
(async function boot() {
  try {
    state.me = await api('/api/auth/me');
  } catch {
    return renderLogin();
  }
  await refreshClients();
  renderShell();
  window.addEventListener('hashchange', route);
  route();
  setInterval(refreshBadges, 60_000);
})();

async function refreshClients() {
  try {
    const { clients } = await api('/api/clients');
    state.clients = clients;
    if (!state.clientId && clients.length === 1) state.clientId = clients[0].id;
    if (state.clientId && !clients.some((c) => c.id === state.clientId)) state.clientId = null;
    state.badges.approvals = clients.reduce((n, c) => n + (c.counts?.pending_approvals ?? 0), 0);
  } catch (err) {
    toast(err.message, 'bad');
  }
}

async function refreshBadges() {
  await refreshClients();
  renderShell();
}

// -------------------------------------------------------------------- login
function renderLogin() {
  const form = h('form.card', {
    style: 'max-width:380px;margin:12vh auto',
    onsubmit: async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      try {
        await api('/api/auth/login', { method: 'POST', body: data });
        location.reload();
      } catch (err) {
        fill(error, err.message);
        error.hidden = false;
      }
    },
  },
    h('div.brand', h('div.brand-mark', 'S'),
      h('div', h('div.brand-name', 'Social OS'), h('div.brand-sub', 'AI command centre'))),
    h('label.field-label', 'Agency'),
    h('input.field', { name: 'agency_slug', required: true, placeholder: 'get-bee-seen' }),
    h('label.field-label', 'Email'),
    h('input.field', { name: 'email', type: 'email', required: true, autocomplete: 'username' }),
    h('label.field-label', 'Password'),
    h('input.field', { name: 'password', type: 'password', required: true, autocomplete: 'current-password' }),
    h('button.btn.primary', { type: 'submit', style: 'margin-top:14px;width:100%' }, 'Sign in'));

  const error = h('div.banner.bad', { hidden: true });
  form.append(error);
  fill(root, form);
}

// -------------------------------------------------------------------- shell
function renderShell() {
  const current = location.hash.slice(1) || '/dashboard';
  const paused = state.me?.agency?.automation_paused;

  const navFor = (group) => ROUTES.filter((r) => r.group === group).map((r) => {
    const badge = r.badge ? state.badges[r.badge] : 0;
    return h('a.nav-item', {
      href: `#${r.path}`,
      'aria-current': current.startsWith(r.path) ? 'page' : null,
    },
      h('span.nav-icon', r.icon),
      h('span', r.label ?? r.view.title),
      badge ? h('span.nav-badge', String(badge)) : null);
  });

  const sidebar = h('nav.sidebar',
    h('div.brand', h('div.brand-mark', 'S'),
      h('div', h('div.brand-name', 'Social OS'),
        h('div.brand-sub', state.me?.agency?.name ?? ''))),
    ...navFor(null),
    h('div.nav-group', 'Client'), ...navFor('Client'),
    h('div.nav-group', 'Agency'), ...navFor('Agency'),
    h('div.sidebar-foot',
      h('button.stop-btn', {
        class: paused ? 'active' : '',
        onclick: (e) => withBusy(e.target, '…', async () => {
          if (paused) {
            await api('/api/automation/resume-all', { method: 'POST' });
            toast('Automation resumed.', 'ok');
          } else {
            const reason = prompt('Pause ALL automation across every client. Reason (optional):');
            if (reason === null) return;
            await api('/api/automation/pause-all', { method: 'POST', body: { reason } });
            toast('All automation paused. Nothing scheduled was deleted.', 'ok');
          }
          state.me = await api('/api/auth/me');
          renderShell();
          route();
        }),
      }, paused ? '▶ Resume all automation' : '🛑 Pause all automation')));

  const searchInput = h('input.search-input', {
    placeholder: 'Search trends, inspiration, conversations, content…',
    onkeydown: (e) => { if (e.key === 'Enter') runSearch(e.target.value); },
  });

  const topbar = h('header.topbar',
    h('select.client-select', {
      onchange: (e) => state.setClient(e.target.value || null),
    },
      h('option', { value: '' }, 'All clients'),
      ...state.clients.map((c) => h('option', { value: c.id, selected: c.id === state.clientId }, c.name))),
    h('div.search-wrap', h('span.search-icon', '⌕'), searchInput),
    h('div.topbar-spacer'),
    h('button.icon-btn', { title: 'Notifications', onclick: showNotifications }, '🔔',
      state.badges.approvals ? h('span.dot') : null),
    h('div.avatar', {
      title: `${state.me?.user?.name} — ${fmt.title(state.me?.user?.role ?? '')}`,
      onclick: showProfile,
    }, (state.me?.user?.name ?? '?').slice(0, 1).toUpperCase()));

  const viewHost = document.getElementById('view') ?? h('main', { id: 'view' });
  fill(root, h('div.app', sidebar, h('div.main', topbar, viewHost)));
}

// ------------------------------------------------------------------- router
async function route() {
  const path = location.hash.slice(1) || '/dashboard';
  const match = ROUTES.find((r) => path.startsWith(r.path)) ?? ROUTES[0];
  const host = document.getElementById('view');
  if (!host) return;
  host.className = 'view';
  renderShell();
  try {
    await match.view.render(document.getElementById('view'), state);
  } catch (err) {
    fill(document.getElementById('view'), h('div.error-state', h('h3', 'This view failed to load'), h('p', err.message)));
  }
}

// ------------------------------------------------------------------- search
async function runSearch(query) {
  if (!query || query.trim().length < 2) return;
  const close = drawer(`Search — “${query}”`, h('div.loading', 'Searching…'));
  try {
    const data = await api(`/api/search?q=${encodeURIComponent(query)}`);
    const body = document.querySelector('.drawer');
    fill(body,
      h('div.drawer-head', h('h2', `Search — “${query}”`),
        h('button.btn.sm', { onclick: close }, 'Close')),
      h('p.small', `${data.total} results · ranked by ${data.ranking}`),
      data.note ? h('div.banner.warn', h('div', data.note)) : null,
      ...Object.entries(data.results).filter(([, rows]) => rows.length).map(([kind, rows]) =>
        h('div.card', { style: 'margin-top:12px' },
          h('h3', fmt.title(kind)),
          ...rows.map((r) => h('div.row',
            h('div.row-main',
              h('div.row-title.truncate', r.title ?? r.detail ?? '—'),
              h('div.row-sub.clamp-2', r.detail ?? '')),
            r.trend_score != null ? pill(String(r.trend_score)) : null,
            r.relevance_score != null ? pill(String(r.relevance_score)) : null,
            r.url ? h('a.btn.sm', { href: r.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open') : null)))));
  } catch (err) {
    toast(err.message, 'bad');
    close();
  }
}

// ------------------------------------------------------------ notifications
async function showNotifications() {
  const close = drawer('Notifications', h('div.loading', 'Loading…'));
  try {
    const data = await api('/api/notifications');
    fill(document.querySelector('.drawer'),
      h('div.drawer-head', h('h2', 'Notifications'),
        h('button.btn.sm', { onclick: close }, 'Close')),
      data.notifications.length
        ? h('div.card', ...data.notifications.map((n) =>
            h('div.row',
              h('div.row-main',
                h('div.row-title', n.title),
                n.body ? h('div.row-sub.clamp-2', n.body) : null,
                h('div.row-sub', fmt.relative(n.created_at))),
              n.status === 'unread'
                ? h('button.btn.sm', {
                    onclick: async (e) => {
                      await api(`/api/notifications/${n.id}/read`, { method: 'POST' });
                      e.target.replaceWith(pill('Read'));
                    },
                  }, 'Mark read')
                : pill('Read'))))
        : empty({ icon: '🔔', title: 'Nothing new', body: 'Trends, opportunities, approvals and failures will show up here.' }));
  } catch (err) {
    toast(err.message, 'bad');
    close();
  }
}

function showProfile() {
  drawer('Account',
    h('div.card',
      h('h3', state.me.user.name),
      h('p.small', state.me.user.email),
      h('div.inline', pill(fmt.title(state.me.user.role), 'info'),
        pill(state.me.user.client_scope.length ? `${state.me.user.client_scope.length} clients` : 'All clients')),
      h('p.small', { style: 'margin-top:12px' },
        `AI provider: ${state.me.ai_provider}. Agency: ${state.me.agency.name}.`),
      h('button.btn.danger', {
        style: 'margin-top:12px',
        onclick: async () => { await api('/api/auth/logout', { method: 'POST' }); location.reload(); },
      }, 'Sign out')));
}
