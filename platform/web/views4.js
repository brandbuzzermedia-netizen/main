import {
  h, fill, api, fmt, PLATFORM_LABEL, scoreChip, pill, statusPill,
  empty, errorState, toast, drawer, checkList, withBusy, loading,
} from './lib.js';
import { load, head, stat, requireClient, needsClient } from './views.js';

/** Publishing log, analytics, competitors, accounts, assistant, settings, audit. */

// ============================================================== publishing ===
export const publishing = {
  title: 'Publishing',
  async render(container, state) {
    if (needsClient(state)) return requireClient(container);
    await load(container, async () => {
      const data = await api(`/api/clients/${state.clientId}/publishing-log`);
      return [
        head('Publishing log', 'Every attempt, its outcome, the platform’s own response and the retry history.'),
        data.entries.length
          ? h('div.stack', ...data.entries.map(publishRow))
          : empty({
              icon: '🚀', title: 'Nothing published yet',
              body: 'Approved content is queued here, published through the platform’s official API, then verified and monitored.',
            }),
      ];
    });
  },
};

function publishRow(entry) {
  const failed = ['failed', 'dead_letter', 'manual_action_required'].includes(entry.status);
  return h('div.card',
    h('div.card-head',
      h('div.row-main',
        h('div.row-sub', `${PLATFORM_LABEL[entry.platform] ?? entry.platform} · ${fmt.title(entry.kind)}`),
        h('div.row-title.truncate', entry.content ?? '—')),
      statusPill(entry.status)),
    h('div.inline',
      pill(`Scheduled ${fmt.dateTime(entry.scheduled_for)}`),
      entry.published_at ? pill(`Published ${fmt.dateTime(entry.published_at)}`, 'ok') : null,
      entry.publish_method ? pill(entry.publish_method === 'manual' ? 'Published manually' : 'Official API') : null,
      entry.attempts ? pill(`${entry.attempts} attempts`) : null),
    entry.external_post_id ? h('p.small.mono', `Post id: ${entry.external_post_id}`) : null,
    entry.url ? h('a.btn.sm', { href: entry.url, target: '_blank', rel: 'noopener noreferrer' }, 'View post') : null,
    failed
      ? h('div.banner.bad', { style: 'margin-top:10px' },
          h('div',
            h('strong', entry.status === 'manual_action_required' ? '✋ Manual publishing required. ' : '❌ Publishing failed. '),
            entry.error ?? 'No detail recorded.'),
          h('div.banner-actions',
            entry.error_class !== 'permanent'
              ? h('button.btn.sm', {
                  onclick: (e) => withBusy(e.target, 'Retrying…', async () => {
                    await api(`/api/publishing-jobs/${entry.job_id}/retry`, { method: 'POST' });
                    toast('Requeued.', 'ok');
                  }),
                }, 'Retry')
              : h('span.small', 'This failure is permanent — fix the content or the connection, then publish again.')))
      : null,
    (entry.retry_history ?? []).length
      ? h('details', h('summary.small', `${entry.retry_history.length} retries`),
          ...entry.retry_history.map((r) => h('div.small.mono', `#${r.attempt} ${fmt.dateTime(r.at)} — ${r.reason} (next in ${r.next_in_seconds}s)`)))
      : null);
}

// =============================================================== analytics ===
export const analytics = {
  title: 'Analytics',
  async render(container, state) {
    if (needsClient(state)) return requireClient(container);
    await load(container, async () => {
      const { summary: s, learning } = await api(`/api/clients/${state.clientId}/analytics`);
      return [
        head('Performance', `Last ${s.window_days} days, from this client’s own connected accounts.`,
          h('button.btn', {
            onclick: (e) => withBusy(e.target, 'Queuing…', async () => {
              await api(`/api/clients/${state.clientId}/analytics/learn`, { method: 'POST' });
              toast('Learning loop queued.', 'ok');
            }),
          }, 'Run learning loop')),

        h('div.grid.grid-4',
          stat('Published', s.publishing.published, `${s.publishing.scheduled} scheduled`),
          stat('Success rate', s.publishing.success_rate == null ? '—' : fmt.percent(s.publishing.success_rate, 0),
            `${s.publishing.failures} failures`),
          stat('Engagement rate', fmt.percent(s.engagement_rate, 2), `${fmt.number(s.reach.reach)} reach`),
          stat('Comments sent', s.engagement.comments_published, `${s.engagement.opportunities_found} opportunities found`)),

        h('div.grid.grid-4', { style: 'margin-top:14px' },
          stat('Views', fmt.number(s.reach.views)), stat('Likes', fmt.number(s.reach.likes)),
          stat('Shares', fmt.number(s.reach.shares)), stat('Saves', fmt.number(s.reach.saves))),

        h('div.grid.grid-2', { style: 'margin-top:14px' },
          h('div.card', h('h3', 'Best performing'),
            s.best.platform
              ? h('div',
                  h('div.row', h('div.row-main', h('div.row-sub', 'Platform'), h('div.row-title', fmt.title(s.best.platform.key))),
                    pill(`${s.best.platform.average} avg`, s.best.platform.confident ? 'ok' : 'warn')),
                  s.best.content_type
                    ? h('div.row', h('div.row-main', h('div.row-sub', 'Content type'), h('div.row-title', fmt.title(s.best.content_type.key))),
                        pill(`${s.best.content_type.average} avg`, s.best.content_type.confident ? 'ok' : 'warn'))
                    : null,
                  !s.best.platform.confident
                    ? h('p.small', `Only ${s.best.platform.samples} posts in this group — treat it as directional, not conclusive.`)
                    : null)
              : h('p.small', 'Not enough published content yet.')),

          h('div.card', h('h3', 'What the AI has learned'),
            learning.length
              ? h('div', ...learning.map((l) => h('div.row',
                  h('div.row-main', h('div.row-title', l.title), h('div.row-sub.clamp-2', l.body)),
                  l.confidence != null ? pill(`${l.confidence}% confidence`, l.confidence > 60 ? 'ok' : 'warn') : null)))
              : h('p.small', 'The learning loop needs a few published items before it can find a pattern worth reporting.'))),

        h('div.card', { style: 'margin-top:14px' },
          h('h3', 'Top posts'),
          s.top_posts.length
            ? h('div', ...s.top_posts.map((p) => h('div.row',
                h('div.row-main',
                  h('div.row-sub', `${PLATFORM_LABEL[p.platform] ?? p.platform} · ${fmt.date(p.published_at)}`),
                  h('div.row-title.truncate', p.caption || '—')),
                pill(`${fmt.number(p.engagement)} engagements`),
                p.url ? h('a.btn.sm', { href: p.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open') : null)))
            : h('p.small', 'Nothing published in this window.')),
      ];
    });
  },
};

// ============================================================= competitors ===
export const competitors = {
  title: 'Competitors',
  async render(container, state) {
    if (needsClient(state)) return requireClient(container);
    await load(container, async () => {
      const data = await api(`/api/clients/${state.clientId}/competitors`);
      return [
        head('Competitor watch', data.note,
          h('button.btn', {
            onclick: (e) => withBusy(e.target, 'Queuing…', async () => {
              await api(`/api/clients/${state.clientId}/competitors/analyze`, { method: 'POST' });
              toast('Competitor sweep queued.', 'ok');
            }),
          }, 'Run sweep')),
        data.competitors.length
          ? h('div.grid.grid-2', ...data.competitors.map((c) =>
              h('div.card',
                h('div.card-head', h('h3', c.name),
                  c.last_checked_at ? pill(`Checked ${fmt.relative(c.last_checked_at)}`) : pill('Never checked', 'warn')),
                h('div.grid.grid-2',
                  stat('Posts this week', c.posts_this_week),
                  stat('Engagement', fmt.number(c.total_engagement))),
                c.top_post
                  ? h('div', { style: 'margin-top:10px' },
                      h('div.small', h('strong', 'Top post')),
                      h('p.small.clamp-2', c.top_post.caption),
                      c.top_post.url ? h('a.btn.sm', { href: c.top_post.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open') : null)
                  : h('p.small', { style: 'margin-top:10px' }, 'Nothing observed yet through the platforms’ official APIs.'))))
          : empty({
              icon: '👀', title: 'No competitors added',
              body: 'Add competitors on the client settings page to track their publicly available activity.',
            }),
      ];
    });
  },
};

// ================================================================ accounts ===
export const accounts = {
  title: 'Social Accounts',
  async render(container, state) {
    if (needsClient(state)) return requireClient(container);
    await load(container, async () => {
      const data = await api(`/api/clients/${state.clientId}/accounts`);
      const connected = new Map(data.accounts.map((a) => [a.platform, a]));

      return [
        head('Social accounts', 'Connected with OAuth. Tokens are encrypted at rest and never leave the server.'),
        h('div.banner',
          h('div', h('strong', 'No passwords, ever. '),
            'This system only ever holds OAuth tokens the account owner granted, sealed with AES-256-GCM. They are never shown in the interface or sent to your browser.')),
        h('div.grid.grid-2', ...data.available.map((p) => accountCard(p, connected.get(p.platform), state, container))),
      ];
    });
  },
};

function accountCard(platform, account, state, container) {
  const caps = platform.capabilities;
  return h('div.card',
    h('div.card-head',
      h('div.row-main', h('h3', platform.display_name),
        h('div.row-sub', account?.handle ?? (platform.oauth_configured ? 'Not connected' : 'Not configured on this deployment'))),
      account ? statusPill(account.connection_status) : pill('Not connected')),

    account ? h('div.inline',
      statusPill(account.token_status),
      account.last_sync_at ? pill(`Synced ${fmt.relative(account.last_sync_at)}`) : null,
      account.api_status !== 'unknown' ? pill(`API ${account.api_status}`, account.api_status === 'ok' ? 'ok' : 'bad') : null) : null,

    account?.last_error ? h('p.small', { style: 'color:var(--bad)' }, account.last_error) : null,

    h('div', { style: 'margin-top:10px' },
      h('div.small', h('strong', 'Can publish: ')),
      caps.publish.length
        ? h('div.inline', ...caps.publish.map((t) => pill(fmt.title(t), 'ok')))
        : h('p.small', 'Nothing — this platform offers no official publishing API. Anything here needs a person.')),

    h('div.inline', { style: 'margin-top:8px' },
      caps.comment ? pill('Comments', 'ok') : pill('No comment API'),
      caps.readPublicSearch ? pill('Public search', 'ok') : pill('No public search'),
      caps.readOwnInsights ? pill('Insights', 'ok') : pill('No insights')),

    Object.keys(caps.notes ?? {}).length
      ? h('details', { style: 'margin-top:8px' },
          h('summary.small', 'What needs a person here'),
          ...Object.entries(caps.notes).map(([type, note]) =>
            h('div.small', h('strong', `${fmt.title(type)}: `), note)))
      : null,

    h('div.inline', { style: 'margin-top:10px' },
      !platform.oauth_configured
        ? h('span.small', 'Set this platform’s app credentials in the environment to enable connection.')
        : account?.connection_status === 'connected'
          ? h('button.btn.sm', {
              onclick: (e) => withBusy(e.target, 'Checking…', async () => {
                const r = await api(`/api/accounts/${account.id}/verify`, { method: 'POST' });
                toast(r.ok ? `Connected as ${r.handle ?? 'account'}` : `Verification failed: ${r.detail}`, r.ok ? 'ok' : 'bad');
              }),
            }, 'Verify connection')
          : h('button.btn.sm.primary', {
              onclick: (e) => withBusy(e.target, 'Starting…', async () => {
                const r = await api(`/api/clients/${state.clientId}/accounts/${platform.platform}/connect`, { method: 'POST' });
                location.href = r.authorize_url;
              }),
            }, 'Connect'),
      account ? h('button.btn.sm.danger', {
        onclick: (e) => withBusy(e.target, '…', async () => {
          if (!confirm(`Disconnect ${platform.display_name}? Stored tokens are deleted.`)) return;
          await api(`/api/accounts/${account.id}`, { method: 'DELETE' });
          toast('Disconnected and tokens deleted.', 'ok');
          accounts.render(container, state);
        }),
      }, 'Disconnect') : null));
}

// =============================================================== assistant ===
export const assistant = {
  title: 'AI Assistant',
  async render(container, state) {
    if (needsClient(state)) return requireClient(container);
    const log = h('div.chat');
    const input = h('input.field', { placeholder: `Ask about ${state.clientName}…` });

    const ask = async (question) => {
      if (!question.trim()) return;
      log.append(h('div.msg.user', question));
      input.value = '';
      const thinking = h('div.msg.bot', '…');
      log.append(thinking);
      log.scrollIntoView({ block: 'end' });
      try {
        const r = await api(`/api/clients/${state.clientId}/assistant`, { method: 'POST', body: { question } });
        thinking.textContent = r.answer;
      } catch (err) {
        thinking.textContent = err.message;
        thinking.classList.add('bad');
      }
    };

    const suggestions = [
      'What is trending for this client?',
      'Give me 10 reel ideas.',
      'Find conversations we can take part in.',
      'Which content performed best this month?',
      'Create tomorrow’s content plan.',
    ];

    fill(container,
      head('AI assistant', `Answers only from ${state.clientName}'s own stored data — never from anywhere else.`),
      h('div.card',
        h('div.inline', { style: 'margin-bottom:12px' },
          ...suggestions.map((s) => h('button.btn.sm', { onclick: () => ask(s) }, s))),
        log,
        h('form.chat-form', { onsubmit: (e) => { e.preventDefault(); ask(input.value); } },
          input, h('button.btn.primary', { type: 'submit' }, 'Ask'))));
  },
};

// ================================================================ settings ===
export const settings = {
  title: 'Settings',
  async render(container, state) {
    if (needsClient(state)) return requireClient(container);
    await load(container, async () => {
      const [data, status] = await Promise.all([
        api(`/api/clients/${state.clientId}`),
        api('/api/system/status').catch(() => null),
      ]);
      const brand = data.brand_profile ?? {};

      const brandForm = h('form.stack', {
        onsubmit: async (e) => {
          e.preventDefault();
          const body = Object.fromEntries(new FormData(e.target));
          for (const key of ['preferred_vocabulary', 'words_to_avoid']) {
            body[key] = String(body[key] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
          }
          try {
            await api(`/api/clients/${state.clientId}/brand-profile`, { method: 'PUT', body });
            toast('Brand voice saved.', 'ok');
          } catch (err) { toast(err.message, 'bad'); }
        },
      },
        textField('Tone', 'tone', brand.tone, 'Professional, knowledgeable, friendly and conversational'),
        textField('Personality', 'personality', brand.personality),
        selectField('Formality', 'formality', ['casual', 'balanced', 'formal'], brand.formality),
        selectField('Emoji', 'emoji_preference', ['none', 'sparing', 'liberal'], brand.emoji_preference),
        textField('Preferred vocabulary', 'preferred_vocabulary', (brand.preferred_vocabulary ?? []).join(', ')),
        textField('Words to avoid', 'words_to_avoid', (brand.words_to_avoid ?? []).join(', ')),
        textField('CTA style', 'cta_style', brand.cta_style),
        areaField('Comment style', 'comment_style', brand.comment_style,
          'Comments should feel like genuine participation in the conversation.'),
        areaField('Compliance notes', 'compliance_notes', brand.compliance_notes,
          'Rules the Brand Guardian and the quality checker enforce. One per line, e.g. "Never say we diagnose or treat."'),
        h('button.btn.primary', { type: 'submit' }, 'Save brand voice'));

      const automation = data.automation.find((r) => r.kind === 'autopilot');
      const autopilotForm = h('form.stack', {
        onsubmit: async (e) => {
          e.preventDefault();
          const f = new FormData(e.target);
          try {
            await api(`/api/clients/${state.clientId}/automation`, {
              method: 'PUT',
              body: {
                kind: 'autopilot',
                mode: f.get('mode'),
                config: {
                  allowed_content_types: f.getAll('types'),
                  sensitive_topics: f.get('sensitive') === 'on',
                },
              },
            });
            toast('Automation settings saved.', 'ok');
          } catch (err) { toast(err.message, 'bad'); }
        },
      },
        selectField('Automation mode', 'mode',
          ['manual', 'approval_required', 'controlled_auto'], automation?.mode ?? 'approval_required'),
        h('p.small',
          'Manual: the AI only recommends. Approval required (default): the AI drafts and waits. ' +
          'Controlled auto: only low-risk items inside this policy may publish themselves — Reddit and Quora never do.'),
        h('label.field-label', 'Content types allowed to auto-publish'),
        h('div.inline', ...['educational', 'promotional', 'trending', 'industry_news', 'seasonal', 'user_generated']
          .map((t) => h('label.inline',
            h('input', {
              type: 'checkbox', name: 'types', value: t,
              checked: (automation?.config?.allowed_content_types ?? ['educational']).includes(t),
            }), h('span.small', fmt.title(t))))),
        h('label.inline', { style: 'margin-top:10px' },
          h('input', { type: 'checkbox', name: 'sensitive', checked: automation?.config?.sensitive_topics === true }),
          h('span.small', 'Allow sensitive topics (off by default)')),
        h('button.btn.primary', { type: 'submit', style: 'margin-top:10px' }, 'Save automation'));

      return [
        head(`${data.client.name} — settings`, 'Brand voice, keywords, automation and connected accounts.'),
        h('div.grid.grid-2',
          h('div.card', h('h2', 'Brand voice'), brandForm),
          h('div.stack',
            h('div.card', h('h2', 'Automation'), autopilotForm),
            h('div.card',
              h('div.card-head', h('h2', 'Pause automation'),
                h('div.view-actions',
                  h('button.btn.sm', {
                    class: data.client.automation_paused ? 'primary' : 'danger',
                    onclick: (e) => withBusy(e.target, '…', async () => {
                      await api(`/api/clients/${state.clientId}/automation/pause`, {
                        method: 'POST', body: { paused: !data.client.automation_paused },
                      });
                      toast(data.client.automation_paused ? 'Automation resumed.' : 'Automation paused for this client.', 'ok');
                      settings.render(container, state);
                    }),
                  }, data.client.automation_paused ? 'Resume client' : 'Pause client'))),
              h('p.small', 'Pausing stops research, scheduled publishing and automated engagement for this client. Nothing scheduled is deleted.')),
            h('div.card',
              h('h2', 'Keywords'),
              h('div.inline', ...data.keywords.slice(0, 40).map((k) => pill(`${k.term} · ${k.kind}`))),
              data.keywords.length === 0 ? h('p.small', 'No keywords yet — research needs them to find anything.') : null))),

        status ? h('div.card', { style: 'margin-top:14px' },
          h('h2', 'System'),
          h('div.inline',
            pill(`AI provider: ${status.ai_provider}`, status.ai_provider === 'offline' ? 'warn' : 'ok'),
            pill(`Research ${status.research_enabled ? 'enabled' : 'disabled'}`),
            pill(`Relevance ≥ ${status.thresholds.relevance}`),
            pill(`Brand fit ≥ ${status.thresholds.brandFit}`),
            pill(`Spam risk ≤ ${status.thresholds.spamRisk}`),
            pill(`${status.limits.commentsPerHourPerClient} comments/hour`),
            pill(`${status.limits.commentsPerDayPerClient} comments/day`)),
          status.ai_provider === 'offline'
            ? h('p.small', 'Running on the offline heuristic provider. Set ANTHROPIC_API_KEY for model-written copy and assessments.')
            : null) : null,
      ];
    });
  },
};

const textField = (label, name, value, placeholder) =>
  h('div', h('label.field-label', label), h('input.field', { name, value: value ?? '', placeholder: placeholder ?? '' }));
const areaField = (label, name, value, placeholder) =>
  h('div', h('label.field-label', label), h('textarea.editor', { name, placeholder: placeholder ?? '' }, value ?? ''));
const selectField = (label, name, options, value) =>
  h('div', h('label.field-label', label),
    h('select.field', { name }, ...options.map((o) => h('option', { value: o, selected: o === value }, fmt.title(o)))));

// =================================================================== audit ===
export const audit = {
  title: 'Audit Log',
  async render(container, state) {
    await load(container, async () => {
      const q = state.clientId ? `?client_id=${state.clientId}` : '';
      const data = await api(`/api/audit${q}`);
      return [
        head('Audit log', 'Every significant action by a person, an agent or the scheduler.'),
        data.entries.length
          ? h('div.card', ...data.entries.map((e) =>
              h('div.row',
                h('span.small.mono', { style: 'width:130px;flex:none' }, fmt.dateTime(e.occurred_at)),
                h('div.row-main',
                  h('div.row-title', e.action),
                  h('div.row-sub', [
                    `${e.actor_type}${e.actor_label ? `: ${e.actor_label}` : ''}`,
                    e.object_type, e.platform,
                  ].filter(Boolean).join(' · '))),
                pill(fmt.title(e.result), { success: 'ok', failure: 'bad', blocked: 'warn' }[e.result] ?? ''))))
          : empty({ icon: '📜', title: 'No activity yet', body: 'Actions appear here as soon as anything happens.' }),
      ];
    });
  },
};
