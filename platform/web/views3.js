import {
  h, fill, api, fmt, PLATFORM_LABEL, scoreChip, pill, statusPill,
  empty, errorState, toast, drawer, checkList, withBusy, loading,
} from './lib.js';
import { load, head, stat, field, requireClient, needsClient } from './views.js';
import { select } from './views2.js';

/** Ideas, calendar, approvals, publishing, analytics, accounts, assistant, settings. */

// ================================================================== ideas ===
export const ideas = {
  title: 'Content Ideas',
  async render(container, state) {
    if (needsClient(state)) return requireClient(container);
    await load(container, async () => {
      const data = await api(`/api/clients/${state.clientId}/ideas`);
      const generate = h('button.btn.primary', {
        onclick: (e) => withBusy(e.target, 'Generating…', async () => {
          const r = await api(`/api/clients/${state.clientId}/ideas/generate`, { method: 'POST', body: { count: 5 } });
          toast(`${r.count} ideas generated.`, 'ok');
          ideas.render(container, state);
        }),
      }, 'Generate ideas');

      return [
        head('Content ideas', 'Built from this client’s live trends, pillars and what has actually performed.', generate),
        data.ideas.length
          ? h('div.grid.grid-2', ...data.ideas.map((i) => ideaCard(i, state, container)))
          : empty({
              icon: '💡', title: 'No ideas yet',
              body: 'The strategist reads this client’s trends, content pillars, past performance and what is already scheduled, then proposes ideas spread across the pillars.',
              action: generate,
            }),
      ];
    });
  },
};

function ideaCard(idea, state, container) {
  const platforms = new Set(idea.platforms ?? []);
  return h('div.card',
    h('div.card-head',
      h('div.row-main', h('h3', idea.title), h('div.row-sub', `${fmt.title(idea.format ?? '—')} · priority ${idea.priority}`)),
      statusPill(idea.status)),
    idea.angle ? h('p.small', idea.angle) : null,
    idea.hook ? h('p.small', h('strong', 'Hook: '), idea.hook) : null,
    h('div.inline', { style: 'margin-top:8px' },
      ...Object.keys(PLATFORM_LABEL).map((p) => {
        const btn = h('button.btn.sm', {
          class: platforms.has(p) ? 'primary' : '',
          onclick: () => {
            platforms.has(p) ? platforms.delete(p) : platforms.add(p);
            btn.className = `btn sm${platforms.has(p) ? ' primary' : ''}`;
          },
        }, PLATFORM_LABEL[p]);
        return btn;
      })),
    h('button.btn.primary', {
      style: 'margin-top:10px',
      onclick: (e) => withBusy(e.target, 'Drafting…', async () => {
        if (!platforms.size) return toast('Pick at least one platform first.', 'bad');
        const r = await api(`/api/clients/${state.clientId}/ideas/${idea.id}/draft`, {
          method: 'POST', body: { platforms: [...platforms] },
        });
        toast(`${r.drafts.length} drafts created and sent for approval.`, 'ok');
        ideas.render(container, state);
      }),
    }, 'Draft for selected platforms'));
}

// =============================================================== calendar ===
export const calendar = {
  title: 'Content Calendar',
  async render(container, state) {
    if (needsClient(state)) return requireClient(container);
    await load(container, async () => {
      const data = await api(`/api/clients/${state.clientId}/calendar`);
      const plan = h('button.btn.primary', { onclick: () => planDrawer(state, container) }, 'Plan a cycle');

      const byDay = new Map();
      for (const item of data.scheduled) {
        const key = (item.scheduled_for ?? '').slice(0, 10) || 'unscheduled';
        byDay.set(key, [...(byDay.get(key) ?? []), item]);
      }

      return [
        head('Content calendar', 'Everything scheduled, in review or published for this client.', plan),
        h('div.inline', { style: 'margin-bottom:12px' },
          ...Object.entries(data.counts).map(([status, n]) => h('span', statusPill(status), ' ', pill(String(n))))),
        data.scheduled.length || data.published.length
          ? h('div', monthGrid(byDay, state, container),
              (byDay.get('unscheduled') ?? []).length
                ? h('div.card', { style: 'margin-top:14px' },
                    h('h3', 'Unscheduled drafts'),
                    ...byDay.get('unscheduled').map((i) => calendarRow(i, state, container)))
                : null)
          : empty({
              icon: '📅', title: 'Nothing on the calendar',
              body: 'Plan a cycle and the strategist will generate ideas, write platform-specific copy, pick times from this client’s own performance history, and send it all for approval.',
              action: plan,
            }),
      ];
    });
  },
};

function monthGrid(byDay, state, container) {
  const today = new Date();
  const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const startOffset = first.getUTCDay();
  const cells = [];
  for (const label of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
    cells.push(h('div.cal-head', label));
  }
  for (let i = 0; i < 42; i++) {
    const date = new Date(first);
    date.setUTCDate(1 - startOffset + i);
    const key = date.toISOString().slice(0, 10);
    const items = byDay.get(key) ?? [];
    const isThisMonth = date.getUTCMonth() === today.getUTCMonth();
    cells.push(h(`div.cal-cell${isThisMonth ? '' : '.dim'}`,
      h('div.cal-date', String(date.getUTCDate())),
      ...items.slice(0, 3).map((item) =>
        h('button.cal-item', { onclick: () => contentDrawer(item, state, container) },
          h('span.cal-plat', PLATFORM_LABEL[item.platform] ?? item.platform), ' ',
          fmt.title(item.content_type))),
      items.length > 3 ? h('div.small', `+${items.length - 3} more`) : null));
  }
  return h('div.cal', ...cells);
}

function calendarRow(item, state, container) {
  return h('div.row',
    h('div.row-main',
      h('div.row-sub', `${PLATFORM_LABEL[item.platform] ?? item.platform} · ${fmt.title(item.content_type)}`),
      h('div.row-title.truncate', item.caption ?? item.hook ?? 'Untitled')),
    statusPill(item.status),
    h('button.btn.sm', { onclick: () => contentDrawer(item, state, container) }, 'Open'));
}

function contentDrawer(item, state, container) {
  const caption = h('textarea.editor', { value: item.caption ?? '' });
  const safety = item.safety_report ?? {};
  const close = drawer(`${PLATFORM_LABEL[item.platform] ?? item.platform} · ${fmt.title(item.content_type)}`,
    h('div.inline', statusPill(item.status), statusPill(item.approval_status),
      item.scheduled_for ? pill(fmt.dateTime(item.scheduled_for)) : pill('Unscheduled', 'warn'),
      item.time_confidence != null ? pill(`Timing confidence ${item.time_confidence}%`) : null),

    safety.verdict === 'DO NOT PUBLISH'
      ? h('div.banner.bad', { style: 'margin-top:12px' },
          h('div', h('strong', '🛑 Safety gate: DO NOT PUBLISH. '),
            `Failed: ${(safety.critical_failures ?? []).map(fmt.title).join(', ')}. Fix these before this can go out.`))
      : safety.verdict === 'NEEDS REVIEW'
        ? h('div.banner.warn', { style: 'margin-top:12px' }, h('div', h('strong', 'Needs review — '), (safety.failed_checks ?? []).map(fmt.title).join(', ')))
        : null,

    h('label.field-label', 'Caption'), caption,
    (item.hashtags ?? []).length
      ? h('div.inline', { style: 'margin-top:8px' }, ...item.hashtags.map((t) => pill(typeof t === 'string' ? t : t.tag)))
      : null,

    safety.checks ? h('div.card', { style: 'margin-top:12px' }, h('h3', 'Safety gate'), checkList(safety.checks)) : null,

    safety.timing ? h('div.card', { style: 'margin-top:12px' },
      h('h3', 'Timing'),
      h('p.small', safety.timing.reason),
      h('div.inline', pill(`${safety.timing.day} ${safety.timing.hour}:${String(safety.timing.minute ?? 0).padStart(2, '0')}`),
        pill(`${safety.timing.confidence}% confidence`),
        pill(safety.timing.source === 'history' ? 'From this client’s history' : 'Platform default'))) : null,

    h('div.inline', { style: 'margin-top:14px' },
      h('button.btn', {
        onclick: (e) => withBusy(e.target, 'Saving…', async () => {
          await api(`/api/content/${item.id}`, { method: 'PATCH', body: { caption: caption.value } });
          toast('Saved. Editing an approved item sends it back for review.', 'ok');
        }),
      }, 'Save'),
      h('button.btn', {
        onclick: (e) => withBusy(e.target, 'Checking…', async () => {
          const gate = await api(`/api/content/${item.id}/safety-check`, { method: 'POST' });
          toast(`${gate.verdict} — ${gate.score}/100`, gate.publishable ? 'ok' : 'bad');
        }),
      }, 'Re-run safety gate'),
      h('button.btn.primary', {
        disabled: !['approved', 'auto_approved'].includes(item.approval_status),
        onclick: (e) => withBusy(e.target, 'Queuing…', async () => {
          await api(`/api/content/${item.id}/publish`, { method: 'POST' });
          toast('Queued for publishing.', 'ok');
          close();
          calendar.render(container, state);
        }),
      }, 'Publish now')),
    !['approved', 'auto_approved'].includes(item.approval_status)
      ? h('p.small', { style: 'margin-top:8px' }, 'Publishing is disabled until a reviewer approves this item in the approval centre.')
      : null);
}

function planDrawer(state, container) {
  const platforms = new Set(['instagram']);
  const close = drawer('Plan a content cycle',
    h('p.small', 'The strategist reads live trends, past performance and what is already scheduled, then drafts platform-specific copy and sends everything for approval.'),
    h('label.field-label', 'Platforms'),
    h('div.inline', ...Object.keys(PLATFORM_LABEL).map((p) => {
      const btn = h('button.btn.sm', {
        class: platforms.has(p) ? 'primary' : '',
        onclick: () => {
          platforms.has(p) ? platforms.delete(p) : platforms.add(p);
          btn.className = `btn sm${platforms.has(p) ? ' primary' : ''}`;
        },
      }, PLATFORM_LABEL[p]);
      return btn;
    })),
    h('label.field-label', 'How many ideas'),
    h('input.field', { type: 'number', id: 'plan-count', value: '5', min: '1', max: '12' }),
    h('button.btn.primary', {
      style: 'margin-top:14px',
      onclick: (e) => withBusy(e.target, 'Planning…', async () => {
        const count = Number(document.getElementById('plan-count').value || 5);
        const r = await api(`/api/clients/${state.clientId}/content-plan`, {
          method: 'POST', body: { platforms: [...platforms], count },
        });
        toast(`${r.ideas} ideas, ${r.drafted} drafts — all in the approval queue.`, 'ok');
        close();
        calendar.render(container, state);
      }),
    }, 'Build the plan'));
}

// ============================================================== approvals ===
export const approvals = {
  title: 'Approvals',
  async render(container, state) {
    let tab = 'all';
    const body = h('div');

    const draw = async () => {
      fill(body, loading(4));
      try {
        const data = await api(`/api/approvals${tab === 'all' ? '' : `?kind=${tab}`}`);
        const selected = new Set();

        const bulkBar = h('div.card', { style: 'margin-bottom:12px' },
          h('div.inline',
            h('span.small', '0 selected'),
            h('button.btn.sm', { onclick: (e) => bulk(e, [...selected], 'approved', false) }, 'Approve selected'),
            h('button.btn.sm', { onclick: (e) => bulk(e, [...selected], 'approved', true) }, 'Approve & publish'),
            h('button.btn.sm.danger', { onclick: (e) => bulk(e, [...selected], 'rejected', false) }, 'Reject selected')));

        const updateCount = () => { bulkBar.querySelector('.small').textContent = `${selected.size} selected`; };

        fill(body,
          data.items.length ? bulkBar : null,
          data.items.length
            ? h('div.stack', ...data.items.map((item) => approvalCard(item, selected, updateCount, draw)))
            : empty({
                icon: '✅', title: 'Nothing waiting',
                body: 'Everything the AI has produced has been decided on. New drafts and replies land here automatically.',
              }));
      } catch (err) {
        fill(body, errorState(err, draw));
      }
    };

    const bulk = async (e, ids, decision, publishNow) => {
      if (!ids.length) return toast('Select some items first.', 'bad');
      await withBusy(e.target, 'Checking…', async () => {
        const preview = await api('/api/approvals/bulk', { method: 'POST', body: { item_ids: ids, decision, publish_now: publishNow } });
        if (preview.confirmation_required) {
          if (!confirm(`${preview.message}\n\n${JSON.stringify(preview.summary.by_kind)}`)) return;
          await api('/api/approvals/bulk', { method: 'POST', body: { item_ids: ids, decision, publish_now: publishNow, confirm: true } });
        }
        toast(`${ids.length} items ${decision}.`, 'ok');
        draw();
      });
    };

    fill(container,
      head('Approval centre', 'Nothing this system produces publishes without a person deciding here.'),
      h('div.inline', { style: 'margin-bottom:14px' },
        ...['all', 'content', 'comment', 'auto_post', 'trending_post', 'engagement'].map((kind) => {
          const btn = h('button.btn.sm', {
            class: kind === tab ? 'primary' : '',
            onclick: () => {
              tab = kind;
              for (const b of container.querySelectorAll('.view-tabs .btn')) b.className = 'btn sm';
              btn.className = 'btn sm primary';
              draw();
            },
          }, fmt.title(kind));
          return btn;
        })),
      body);
    container.querySelector('.inline').classList.add('view-tabs');
    await draw();
  },
};

function approvalCard(item, selected, updateCount, refresh) {
  const checkbox = h('input', {
    type: 'checkbox',
    onchange: (e) => { e.target.checked ? selected.add(item.id) : selected.delete(item.id); updateCount(); },
  });
  return h('div.card',
    h('div.card-head', checkbox,
      item.quality_score != null ? scoreChip(item.quality_score, 'Quality') : null,
      h('div.row-main',
        h('div.row-sub', `${fmt.title(item.kind)}${item.platform ? ` · ${PLATFORM_LABEL[item.platform] ?? item.platform}` : ''} · ${fmt.relative(item.created_at)}`),
        h('div.row-title.truncate', item.title)),
      (item.risk_flags ?? []).length ? pill(`${item.risk_flags.length} flags`, 'warn') : pill('Clean', 'ok')),
    item.preview ? h('p.small.clamp-2', item.preview) : null,
    (item.risk_flags ?? []).length
      ? h('div.inline', ...item.risk_flags.map((f) => pill(fmt.title(f), 'warn')))
      : null,
    h('div.inline', { style: 'margin-top:10px' },
      h('button.btn.sm.primary', {
        onclick: (e) => withBusy(e.target, 'Approving…', async () => {
          await api(`/api/approvals/${item.id}/decide`, { method: 'POST', body: { decision: 'approved' } });
          toast('Approved.', 'ok'); refresh();
        }),
      }, 'Approve'),
      item.kind === 'content' ? h('button.btn.sm', {
        onclick: (e) => withBusy(e.target, 'Publishing…', async () => {
          await api(`/api/approvals/${item.id}/decide`, { method: 'POST', body: { decision: 'approved', publish_now: true } });
          toast('Approved and queued to publish.', 'ok'); refresh();
        }),
      }, 'Approve & publish') : null,
      h('button.btn.sm.danger', {
        onclick: (e) => withBusy(e.target, 'Rejecting…', async () => {
          await api(`/api/approvals/${item.id}/decide`, { method: 'POST', body: { decision: 'rejected' } });
          toast('Rejected.', 'ok'); refresh();
        }),
      }, 'Reject')));
}
