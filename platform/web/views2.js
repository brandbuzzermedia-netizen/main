import {
  h, fill, api, fmt, PLATFORM_LABEL, scoreChip, pill, statusPill,
  empty, errorState, toast, drawer, checkList, withBusy, loading,
} from './lib.js';
import { load, head, stat, field, requireClient, needsClient } from './views.js';

/** Trends, inspiration, engagement, approvals, calendar, accounts. */

// ================================================================= trends ===
export const trends = {
  title: 'Trends',
  async render(container, state) {
    if (needsClient(state)) return requireClient(container);
    await load(container, async () => {
      const data = await api(`/api/clients/${state.clientId}/trends`);
      const discover = h('button.btn.primary', {
        onclick: (e) => withBusy(e.target, 'Queuing…', async () => {
          const r = await api(`/api/clients/${state.clientId}/trends/discover`, { method: 'POST' });
          toast(r.note ?? 'Discovery queued.', 'ok');
        }),
      }, 'Discover now');

      return [
        head(`What's trending for ${state.clientName}?`,
          'Scored 0-100 from recency, velocity, engagement, client relevance and cross-platform spread.',
          discover),
        data.trends.length
          ? h('div.grid.grid-2', ...data.trends.map((t) => trendCard(t, state)))
          : empty({
              icon: '🔥', title: 'No trends detected yet',
              body: 'Trend discovery runs on a schedule and searches only the platforms whose official APIs support search, using this client’s connected accounts. Connect an account, add keywords, then run discovery.',
              action: discover,
            }),
      ];
    });
  },
};

function trendCard(t, state) {
  const b = t.score_breakdown ?? {};
  return h('div.card',
    h('div.card-head',
      scoreChip(t.trend_score),
      h('div.row-main',
        h('h3', t.topic),
        h('div.row-sub', `${fmt.title(t.classification)} · detected ${fmt.relative(t.detected_at)}`)),
      urgencyPill(t.urgency)),
    t.why_it_matters ? h('p.small', t.why_it_matters) : null,
    h('div.stack',
      ...Object.entries({
        Recency: b.recency, Velocity: b.velocity, Engagement: b.engagement,
        Relevance: b.relevance, 'Cross-platform': b.cross_platform,
      }).filter(([, v]) => v != null).map(([label, value]) =>
        h('div',
          h('div.small', `${label} — ${Math.round(value)}`),
          h('div.bar', h('span', { style: `width:${Math.round(value)}%` }))))),
    h('div.inline', { style: 'margin-top:10px' },
      ...(t.platforms ?? []).map((p) => pill(PLATFORM_LABEL[p] ?? p)),
      t.velocity_pct != null ? pill(`${t.velocity_pct > 0 ? '+' : ''}${t.velocity_pct}% mentions`, t.velocity_pct > 40 ? 'warn' : '') : null),
    h('div.inline', { style: 'margin-top:10px' },
      h('button.btn.sm.primary', {
        onclick: (e) => withBusy(e.target, 'Generating…', async () => {
          const r = await api(`/api/clients/${state.clientId}/ideas/generate`, {
            method: 'POST', body: { count: 3 },
          });
          toast(`${r.count} ideas generated. They are in Content Ideas.`, 'ok');
        }),
      }, 'Turn into ideas'),
      (t.sources ?? []).length
        ? h('button.btn.sm', { onclick: () => sourcesDrawer(t) }, `${t.sources.length} sources`)
        : null));
}

const urgencyPill = (u) => pill(fmt.title(u ?? 'normal'),
  { critical: 'bad', high: 'warn', normal: 'info', low: '' }[u] ?? '');

function sourcesDrawer(t) {
  drawer(`Sources — ${t.topic}`,
    h('p.small', 'Every source the research engine actually saw, through the platforms’ own APIs.'),
    h('div.card', ...(t.sources ?? []).map((s) =>
      h('div.row', h('div.row-main',
        h('div.row-title.clamp-2', s.title || '(untitled)'),
        h('div.row-sub', [PLATFORM_LABEL[s.platform] ?? s.platform, s.published_at && fmt.date(s.published_at)].filter(Boolean).join(' · '))),
        s.url ? h('a.btn.sm', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open') : pill('Demo data')))));
}

// ============================================================ inspiration ===
export const inspiration = {
  title: 'Inspiration',
  async render(container, state) {
    if (needsClient(state)) return requireClient(container);
    const filters = { platform: '', sort: 'viral', format: '' };

    const body = h('div');
    const draw = async () => {
      fill(body, loading(3));
      try {
        const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
        const data = await api(`/api/clients/${state.clientId}/inspiration?${params}`);
        fill(body, data.items.length
          ? h('div.grid.grid-3', ...data.items.map((i) => inspirationCard(i, state)))
          : empty({
              icon: '🎬', title: 'No inspiration collected yet',
              body: 'Inspiration comes from high-performing public content the platforms’ own search APIs return for this client’s keywords.',
            }));
      } catch (err) {
        fill(body, errorState(err, draw));
      }
    };

    fill(container,
      head('Inspiration', 'Reference for structure only — every adaptation must be original work for this client.'),
      h('div.card', { style: 'margin-bottom:14px' },
        h('div.inline',
          select('Platform', ['', ...Object.keys(PLATFORM_LABEL)], (v) => { filters.platform = v; draw(); }),
          select('Format', ['', 'reel', 'carousel', 'image', 'video', 'text', 'discussion'], (v) => { filters.format = v; draw(); }),
          select('Sort by', ['viral', 'relevant', 'growing', 'recent', 'engagement'], (v) => { filters.sort = v; draw(); }))),
      body);
    await draw();
  },
};

function inspirationCard(i, state) {
  return h('div.card',
    h('div.card-head', scoreChip(i.viral_score, 'Viral score'),
      h('div.row-main',
        h('h3.truncate', i.topic ?? 'Untitled'),
        h('div.row-sub', `${PLATFORM_LABEL[i.platform] ?? i.platform} · ${i.creator ?? '—'} · ${fmt.title(i.content_format ?? '')}`))),
    h('div.inline',
      pill(`${fmt.number(i.views)} views`), pill(`${fmt.number(i.likes)} likes`),
      pill(`${fmt.percent(i.engagement_rate, 2)} ER`)),
    i.hook ? h('p.small', { style: 'margin-top:9px' }, h('strong', 'Hook: '), i.hook) : null,
    i.why_it_worked ? h('p.small.clamp-2', h('strong', 'Why it worked: '), i.why_it_worked) : null,
    h('div.inline', { style: 'margin-top:10px' },
      h('button.btn.sm', { onclick: () => inspirationDrawer(i, state) }, 'Details'),
      h('button.btn.sm', {
        onclick: (e) => withBusy(e.target, '…', async () => {
          await api(`/api/clients/${state.clientId}/inspiration/${i.id}/save`, { method: 'POST', body: { saved: !i.saved } });
          toast(i.saved ? 'Removed from library' : 'Saved to library', 'ok');
        }),
      }, i.saved ? 'Saved' : 'Save'),
      i.url ? h('a.btn.sm', { href: i.url, target: '_blank', rel: 'noopener noreferrer' }, 'Original') : null));
}

function inspirationDrawer(i, state) {
  drawer(i.topic ?? 'Inspiration',
    h('div.card',
      h('div.grid.grid-4',
        stat('Views', fmt.number(i.views)), stat('Likes', fmt.number(i.likes)),
        stat('Comments', fmt.number(i.comments)), stat('Shares', fmt.number(i.shares)))),
    h('div.card', { style: 'margin-top:12px' },
      h('h3', 'Structure'),
      detail('Hook', i.hook), detail('Caption structure', i.caption_structure), detail('CTA', i.cta)),
    h('div.card', { style: 'margin-top:12px' },
      h('h3', 'Why it worked'), h('p.small', i.why_it_worked ?? '—')),
    h('div.card', { style: 'margin-top:12px' },
      h('h3', 'Suggested adaptation'),
      h('p.small', i.suggested_adaptation ?? '—'),
      h('div.banner.warn', { style: 'margin-top:10px' },
        h('div', h('strong', 'Original work only. '),
          'Use the structure as a reference. Never reuse the original’s media, script or captions.'))),
    h('button.btn.primary', {
      style: 'margin-top:12px',
      onclick: (e) => withBusy(e.target, 'Generating…', async () => {
        const r = await api(`/api/clients/${state.clientId}/ideas/generate`, { method: 'POST', body: { count: 3 } });
        toast(`${r.count} original ideas generated.`, 'ok');
      }),
    }, 'Generate original ideas from this'));
}

const detail = (label, value) => value
  ? h('div', { style: 'margin-top:8px' }, h('div.small', h('strong', label)), h('div', value))
  : null;

// ============================================================= engagement ===
export const engagement = {
  title: 'Engagement',
  async render(container, state) {
    if (needsClient(state)) return requireClient(container);
    await load(container, async () => {
      const data = await api(`/api/clients/${state.clientId}/opportunities`);
      const discover = h('button.btn.primary', {
        onclick: (e) => withBusy(e.target, 'Queuing…', async () => {
          await api(`/api/clients/${state.clientId}/opportunities/discover`, { method: 'POST' });
          toast('Discovery queued — it runs in the background.', 'ok');
        }),
      }, 'Find opportunities');

      return [
        head('Engagement opportunities',
          'Conversations where this client genuinely has something to add. A recommendation is advice to a person, not permission to post.',
          discover),
        h('div.banner',
          h('div', h('strong', 'Default threshold: '),
            'relevance ≥ 80, brand fit ≥ 75, spam risk ≤ 20. Reddit and Quora always require a person, whatever the score.')),
        data.opportunities.length
          ? h('div.stack', ...data.opportunities.map((o) => opportunityCard(o, state)))
          : empty({
              icon: '💬', title: 'No opportunities found',
              body: 'Discovery searches only the platforms whose official APIs support public search, using this client’s connected accounts and keywords.',
              action: discover,
            }),
      ];
    });
  },
};

function opportunityCard(o, state) {
  const scores = [
    ['Relevance', o.relevance_score], ['Brand fit', o.brand_fit_score],
    ['Quality', o.conversation_quality_score],
    ['Promo risk', o.promotional_risk_score], ['Spam risk', o.spam_risk_score],
  ];
  return h('div.card',
    h('div.card-head',
      scoreChip(o.relevance_score, 'Relevance'),
      h('div.row-main',
        h('div.row-sub', `${PLATFORM_LABEL[o.platform] ?? o.platform}${o.context ? ` · ${o.context}` : ''} · ${o.author ?? '—'}`),
        h('div.row-title.clamp-2', o.excerpt)),
      pill(fmt.title(o.recommended_action),
        { engage: 'ok', review: 'warn', ignore: 'bad' }[o.recommended_action] ?? '')),
    h('div.inline', ...scores.map(([label, v]) => pill(`${label} ${v}`,
      label.includes('risk') ? (v > 40 ? 'bad' : v > 20 ? 'warn' : 'ok') : (v >= 80 ? 'ok' : v >= 60 ? 'warn' : '')))),
    o.reasoning ? h('p.small', { style: 'margin-top:9px' }, o.reasoning) : null,
    h('div.inline', { style: 'margin-top:10px' },
      h('button.btn.sm.primary', {
        onclick: (e) => withBusy(e.target, 'Drafting…', async () => {
          const r = await api(`/api/clients/${state.clientId}/opportunities/${o.id}/comments`, { method: 'POST' });
          commentsDrawer(o, r, state);
        }),
      }, 'Draft replies'),
      o.url ? h('a.btn.sm', { href: o.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open thread') : null,
      h('button.btn.sm', {
        onclick: (e) => withBusy(e.target, '…', async () => {
          await api(`/api/clients/${state.clientId}/opportunities/${o.id}`, {
            method: 'PATCH', body: { status: 'dismissed' },
          });
          toast('Dismissed.', 'ok');
          e.target.closest('.card').remove();
        }),
      }, 'Dismiss')));
}

function commentsDrawer(opportunity, result, state) {
  drawer('Draft replies',
    h('div.card', h('div.small', 'Replying to'), h('p', opportunity.excerpt)),
    h('div.banner', h('div', result.note)),
    ...result.comments.map((c) => commentCard(c, state)));
}

function commentCard(c, state) {
  const quality = c.quality_report ?? {};
  const textarea = h('textarea.editor', { value: c.body });
  return h('div.card', { style: 'margin-top:12px' },
    h('div.card-head',
      h('h3', fmt.title(c.variant)),
      scoreChip(c.quality_score, 'Quality score'),
      c.blocked ? pill('Blocked', 'bad') : statusPill(c.status)),
    textarea,
    c.blocked
      ? h('div.banner.bad', { style: 'margin-top:10px' },
          h('div', h('strong', 'Blocked — '),
            `failed a critical check: ${(quality.blocking_checks ?? []).map(fmt.title).join(', ')}. This variant cannot be approved.`))
      : null,
    checkList(quality.checks),
    h('div.inline', { style: 'margin-top:10px' },
      h('button.btn.sm', {
        onclick: (e) => withBusy(e.target, 'Saving…', async () => {
          const r = await api(`/api/comments/${c.id}`, { method: 'PATCH', body: { body: textarea.value } });
          toast(`Saved and re-checked — quality ${r.quality.score}/100.`, r.quality.blocked ? 'bad' : 'ok');
        }),
      }, 'Save edit'),
      h('button.btn.sm.primary', {
        disabled: Boolean(c.blocked),
        onclick: (e) => withBusy(e.target, 'Approving…', async () => {
          const r = await api(`/api/comments/${c.id}/approve`, { method: 'POST' });
          toast(r.queued ? 'Approved and queued to publish.' : `Approved. ${r.manual_note ?? r.reason}`, 'ok');
        }),
      }, 'Approve')));
}

function select(label, options, onchange) {
  return h('label.inline', h('span.small', label),
    h('select.field', { style: 'width:auto', onchange: (e) => onchange(e.target.value) },
      ...options.map((o) => h('option', { value: o }, o ? fmt.title(o) : 'All'))));
}

export { select, detail, commentCard };
