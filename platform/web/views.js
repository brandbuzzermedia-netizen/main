import {
  h, fill, api, fmt, PLATFORM_LABEL, scoreChip, pill, statusPill,
  empty, loading, errorState, toast, drawer, checkList, withBusy,
} from './lib.js';

/**
 * Views. Each exports `render(container, state)` and is responsible for its own
 * loading, empty and error states (§45).
 */

const needsClient = (state) => !state.clientId;

function requireClient(container) {
  fill(container, empty({
    icon: '👥',
    title: 'Pick a client first',
    body: 'Everything in this section is scoped to one client. Choose one from the selector at the top.',
  }));
}

/** Wrap an async view body in loading / error handling. */
async function load(container, fn) {
  fill(container, loading(4));
  try {
    const content = await fn();
    fill(container, content);
  } catch (err) {
    fill(container, errorState(err, () => load(container, fn)));
  }
}

const head = (title, description, ...actions) =>
  h('div.view-head',
    h('div', h('h1', title), description && h('p', description)),
    actions.filter(Boolean).length ? h('div.view-actions', ...actions) : null);

// ============================================================== dashboard ===
export const dashboard = {
  title: 'Dashboard',
  async render(container, state) {
    await load(container, async () => {
      const data = await api('/api/dashboard');
      const t = data.totals;

      const stats = h('div.grid.grid-4',
        stat('Clients', t.clients, 'active in this agency'),
        stat('Awaiting approval', t.pending_approvals, 'nothing publishes without a person'),
        stat('Open opportunities', t.opportunities, 'conversations worth joining'),
        stat('Live trends', t.trends, 'across every client'));

      const problems = (t.failures || t.manual_action_required)
        ? h('div.grid.grid-2',
            t.failures ? h('div.card',
              h('div.card-head', h('h2', '❌ Publishing failures'), pill(String(t.failures), 'bad')),
              h('p.small', 'Open the publishing log for the platform’s own error and the retry history.')) : null,
            t.manual_action_required ? h('div.card',
              h('div.card-head', h('h2', '✋ Manual action required'), pill(String(t.manual_action_required), 'warn')),
              h('p.small', 'These platforms offer no official API path for that content type. They need a person to publish them.')) : null)
        : null;

      const clients = data.clients.length
        ? h('div.grid.grid-3', ...data.clients.map((c) =>
            h('div.card',
              h('div.card-head',
                h('h3', c.name),
                c.automation_paused ? pill('Paused', 'warn') : null,
                !c.onboarding_complete ? pill('Onboarding', 'info') : null),
              h('p.small', c.industry ?? '—'),
              h('div.row',
                h('div.row-main', h('div.row-sub', 'Trends'), h('div.row-title', String(c.trends))),
                h('div.row-main', h('div.row-sub', 'Opportunities'), h('div.row-title', String(c.opportunities))),
                h('div.row-main', h('div.row-sub', 'Approvals'), h('div.row-title', String(c.pending_approvals)))),
              h('button.btn.sm', {
                onclick: () => { state.setClient(c.id); location.hash = '#/client'; },
              }, 'Open client'))))
        : empty({
            icon: '👥', title: 'No clients yet',
            body: 'Add your first client to start collecting trends, inspiration and engagement opportunities for them.',
            action: h('a.btn.primary', { href: '#/clients' }, 'Add a client'),
          });

      return [
        head('Agency dashboard', `${data.agency.name} — every client at a glance.`),
        data.agency.automation_paused
          ? h('div.banner.bad',
              h('div', h('strong', '🛑 All automation is paused. '),
                data.agency.paused_reason ?? 'Scheduled publishing and automated engagement are stopped. Nothing scheduled has been deleted.'))
          : null,
        stats,
        problems,
        h('h2', { style: 'margin:22px 0 10px' }, 'Clients'),
        clients,
      ];
    });
  },
};

const stat = (label, value, sub) =>
  h('div.card.stat', h('div.label', label), h('div.value', String(value ?? 0)), sub && h('div.sub', sub));

// ============================================================ client view ===
export const client = {
  title: 'Client',
  async render(container, state) {
    if (needsClient(state)) return requireClient(container);
    await load(container, async () => {
      const d = await api(`/api/clients/${state.clientId}/dashboard`);
      const brief = d.daily_brief?.payload;

      return [
        head(d.client.name, [d.client.industry, d.client.location].filter(Boolean).join(' · '),
          h('button.btn', {
            onclick: (e) => withBusy(e.target, 'Queuing…', async () => {
              const r = await api(`/api/clients/${state.clientId}/brief/generate`, { method: 'POST' });
              toast(r.deduped ? 'A brief is already being generated.' : 'Brief queued — it runs in the background.', 'ok');
            }),
          }, 'Generate brief'),
          h('button.btn.primary', { onclick: () => { location.hash = '#/content'; } }, 'Plan content')),

        d.client.automation_paused
          ? h('div.banner.warn', h('div', h('strong', '⏸ Automation is paused for this client.'),
              ' Research, scheduled publishing and engagement are all stopped.'))
          : null,

        brief ? h('div.card', { style: 'margin-bottom:14px' },
          h('div.card-head', h('h2', `☀️ ${brief.greeting ?? 'Daily brief'}`),
            h('span.small', { style: 'margin-left:auto' }, fmt.relative(d.daily_brief.created_at))),
          h('p', h('strong', brief.headline ?? '')),
          h('p', brief.recommended_action ?? ''),
          brief.summary?.length ? h('div.inline', ...brief.summary.map((s) => pill(s))) : null) : null,

        h('div.grid.grid-4',
          stat('Trends', d.trends.length, 'live signals'),
          stat('Opportunities', d.opportunities.length, 'conversations to join'),
          stat('Awaiting approval', d.pending_approvals, 'in the queue'),
          stat('Engagement rate', fmt.percent(d.performance.engagement_rate, 2), 'last 30 days')),

        h('div.grid.grid-2', { style: 'margin-top:14px' },
          panel('🔥 Trending now', d.trends, (t) =>
            h('div.row', scoreChip(t.trend_score),
              h('div.row-main',
                h('div.row-title.truncate', t.topic),
                h('div.row-sub.clamp-2', t.why_it_matters ?? fmt.title(t.classification)))),
            'Run trend discovery to see what is moving for this client.'),

          panel('💬 Engagement opportunities', d.opportunities, (o) =>
            h('div.row', scoreChip(o.relevance_score, 'Relevance'),
              h('div.row-main',
                h('div.row-sub', `${PLATFORM_LABEL[o.platform] ?? o.platform} · ${fmt.title(o.recommended_action)}`),
                h('div.row-title.clamp-2', o.excerpt))),
            'No open conversations found yet.'),

          panel('🎬 Inspiration', d.inspiration, (i) =>
            h('div.row', scoreChip(i.viral_score, 'Viral score'),
              h('div.row-main',
                h('div.row-sub', `${PLATFORM_LABEL[i.platform] ?? i.platform} · ${i.creator ?? '—'}`),
                h('div.row-title.truncate', i.topic ?? '—'),
                h('div.row-sub.clamp-2', i.why_it_worked ?? ''))),
            'Nothing collected yet.'),

          panel('📅 Upcoming', d.upcoming, (s) =>
            h('div.row',
              h('div.row-main',
                h('div.row-sub', `${PLATFORM_LABEL[s.platform] ?? s.platform} · ${fmt.title(s.content_type)}`),
                h('div.row-title.truncate', s.caption ?? s.hook ?? 'Untitled'),
                h('div.row-sub', fmt.dateTime(s.scheduled_for))),
              statusPill(s.status)),
            'Nothing scheduled.'),

          panel('💡 Content ideas', d.ideas, (i) =>
            h('div.row', h('div.row-main',
              h('div.row-title.truncate', i.title),
              h('div.row-sub.clamp-2', i.angle ?? ''))),
            'No ideas generated yet.'),

          h('div.card',
            h('div.card-head', h('h2', '🤖 Autopilot')),
            h('div.inline',
              d.autopilot.enabled ? pill('On', 'warn') : pill('Off — approval required', 'ok'),
              pill(fmt.title(d.autopilot.mode))),
            h('p.small', { style: 'margin-top:10px' },
              d.autopilot.enabled
                ? 'Low-risk items inside the configured policy can publish without a person. Every other item still waits for approval.'
                : 'Everything this client produces waits for a human decision before it goes out.'),
            h('a.btn.sm', { href: '#/settings' }, 'Automation settings'))),

        h('div.card', { style: 'margin-top:14px' },
          h('div.card-head', h('h2', '📊 Performance'), h('span.small', { style: 'margin-left:auto' }, 'Last 30 days')),
          h('div.grid.grid-4',
            stat('Published', d.performance.publishing.published),
            stat('Success rate', d.performance.publishing.success_rate == null ? '—' : fmt.percent(d.performance.publishing.success_rate, 0)),
            stat('Reach', fmt.number(d.performance.reach.reach)),
            stat('Comments sent', d.performance.engagement.comments_published))),
      ];
    });
  },
};

function panel(title, items, renderItem, emptyText) {
  return h('div.card',
    h('div.card-head', h('h2', title), items.length ? pill(String(items.length)) : null),
    items.length ? h('div', ...items.map(renderItem)) : h('p.small', emptyText));
}

// ================================================================ clients ===
export const clients = {
  title: 'Clients',
  async render(container, state) {
    await load(container, async () => {
      const { clients: rows } = await api('/api/clients');
      return [
        head('Clients', 'Every client is fully isolated: their data, accounts, voice and automation never mix.',
          h('button.btn.primary', { onclick: () => newClientForm(state) }, '+ New client')),
        rows.length
          ? h('div.card', ...rows.map((c) =>
              h('div.row',
                h('div.row-main',
                  h('div.row-title', c.name),
                  h('div.row-sub', [c.industry, c.location].filter(Boolean).join(' · ') || '—')),
                h('div.inline',
                  pill(`${c.counts.accounts} accounts`),
                  c.counts.pending_approvals ? pill(`${c.counts.pending_approvals} to approve`, 'warn') : null,
                  !c.onboarding_complete ? pill('Onboarding', 'info') : null),
                h('button.btn.sm', {
                  onclick: () => { state.setClient(c.id); location.hash = '#/client'; },
                }, 'Open'))))
          : empty({
              icon: '👥', title: 'No clients yet',
              body: 'A client holds its own brand voice, keywords, accounts, research and automation settings.',
              action: h('button.btn.primary', { onclick: () => newClientForm(state) }, 'Add your first client'),
            }),
      ];
    });
  },
};

function newClientForm(state) {
  const form = h('form.stack', {
    onsubmit: async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      try {
        const { client: created } = await api('/api/clients', {
          method: 'POST',
          body: { ...data, products: splitList(data.products), target_geography: splitList(data.target_geography) },
        });
        toast(`${created.name} created. Next: brand voice and keywords.`, 'ok');
        state.setClient(created.id);
        close();
        location.hash = '#/settings';
      } catch (err) {
        toast(err.message, 'bad');
      }
    },
  },
    field('Client name', 'name', { required: true, placeholder: 'Ashvee Diagnostics' }),
    field('Company name', 'company_name'),
    field('Website', 'website', { placeholder: 'https://…' }),
    field('Industry', 'industry', { placeholder: 'Diagnostics and preventive healthcare' }),
    field('Location', 'location', { placeholder: 'Bengaluru' }),
    field('Description', 'description', { textarea: true, placeholder: 'What they do, in a sentence or two.' }),
    field('Products / services', 'products', { placeholder: 'Comma separated' }),
    field('Target audience', 'target_audience', { textarea: true }),
    field('Target geography', 'target_geography', { placeholder: 'Comma separated' }),
    h('button.btn.primary', { type: 'submit' }, 'Create client'));

  const close = drawer('New client', h('p.small', 'Step 1 of 4 — business information. Brand voice, pillars and keywords come next.'), form);
}

function field(label, name, opts = {}) {
  const input = opts.textarea
    ? h('textarea.editor', { name, placeholder: opts.placeholder ?? '' })
    : h('input.field', { name, required: opts.required, placeholder: opts.placeholder ?? '', value: opts.value ?? '' });
  return h('div', h('label.field-label', label), input);
}

const splitList = (value) => String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export { load, head, stat, field, splitList, requireClient, needsClient };
