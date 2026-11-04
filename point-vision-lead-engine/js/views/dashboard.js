/* Dashboard, Intern Workspace and Founder Workspace. */
(function () {
  'use strict';
  const PV = window.PV, E = PV.E, U = PV.U;
  const { html, icon } = U;

  const pct = (n, d) => (d ? Math.min(100, Math.round(n * 100 / d)) : 0);
  const bar = (n, d, cls) => html`<div class="progress ${cls || ''}"><i style="width:${pct(n, d)}%"></i></div>`;

  function sampleBanner() {
    if (!PV.leads.some((l) => l.sample) || PV.prefs.hideSample) return '';
    return html`<div class="banner sample"><span>Showing <b>sample leads</b> (fictional people and companies) so you can try the workflow. Clear them in Settings → Data when you start for real.</span>
      <span class="x nowrap"><a class="btn sm" href="#/settings/data">Settings</a> <button class="btn sm ghost" data-action="hide-sample">Hide</button></span></div>`;
  }
  PV.sampleBanner = sampleBanner;
  PV.actions['hide-sample'] = () => { PV.prefs.hideSample = true; PV.savePrefs(); PV.render(); };

  function todayStats() {
    const t = PV.today();
    return E.activity(PV.leads, t, t);
  }

  const FLOW = [
    ['Prospecting', 'added'], ['Research', 'researched'], ['Verification', 'verified'], ['Personalization', 'drafted'],
    ['Founder Review', 'submitted'], ['Email Sent', 'sent'], ['LinkedIn Follow-up', 'linkedinRequested'], ['Response', 'replied'], ['Meeting', 'meeting']
  ];

  function greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }

  function conversionCard() {
    const conv = E.conversions(PV.leads);
    return html`<div class="card">
      <div class="card-h"><h2>Conversion Metrics</h2><span class="sub">All time, from logged activity only</span><div class="right"><a class="btn sm" href="#/analytics">Weekly report</a></div></div>
      <div class="card-b conv">${conv.map((c) => html`<div class="r">
        <div class="strong">${c.label}</div>
        ${bar(c.num, c.den, 'coral')}
        <div class="pct">${c.pct == null ? '—' : c.pct + '%'}<small>${c.num} of ${c.den}</small></div>
      </div>`)}</div>
    </div>`;
  }

  /* ---------------- Dashboard ---------------- */

  PV.views.dashboard = {
    render() {
      const a = todayStats();
      const target = PV.target();
      const review = PV.leads.filter((l) => l.status === 'review');
      const ready = PV.leads.filter((l) => l.status === 'approved');
      const due = PV.followupsDue();
      const untouched = PV.leads.filter((l) => ['new', 'researching'].includes(l.status)).sort((x, y) => PV.score(y).total - PV.score(x).total).slice(0, 5);
      const dateStr = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
      return html`
        ${sampleBanner()}
        <div class="page-head"><div><h1>${greeting()}</h1><p class="sub">${dateStr}. ${target} qualified prospects a day, researched properly, reviewed by a founder and sent by hand.</p></div>
          <div class="actions"><a class="btn" href="#/finder">${icon('search')}Lead Finder</a></div></div>

        <div class="card target">
          <div><div class="lbl">Today's target</div><div class="big">${a.added}<small> / ${target}</small></div><div style="color:#a1a1aa;font-weight:600;margin-top:6px">Prospects added</div></div>
          <div><h2>${target} Target Prospects</h2>
            <p style="color:#d4d4d8;margin-top:4px">${a.added >= target ? 'Target reached for today. Keep the quality bar high.' : `${target - a.added} more to find today. Use Lead Finder to generate searches.`}</p>
            <div class="bar"><i style="width:${pct(a.added, target)}%"></i></div></div>
        </div>

        <div class="card mt">
          <div class="card-h"><h2>Today's flow</h2><span class="sub">How far today's work has moved, against the daily target of ${target}</span></div>
          <div class="flow">${FLOW.map(([label, key]) => html`<div class="st"><div class="t">${label}</div><div class="n">${a[key] || 0}</div>${bar(a[key] || 0, target, key === 'added' ? 'coral' : '')}</div>`)}</div>
        </div>

        <h2 class="mt" style="margin:22px 0 10px">Today's Activity</h2>
        <div class="kpis">
          ${[['Target', target, 'prospects / day'], ['Prospects Added', a.added], ['Research Completed', a.researched], ['Emails Drafted', a.drafted], ['Emails Approved', a.approved],
            ['Emails Sent', a.sent], ['LinkedIn Requests', a.linkedinRequested], ['Replies', a.replied], ['Positive Replies', a.positive], ['Meetings Booked', a.meeting]]
            .map(([k, v, d]) => html`<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div>${d ? html`<div class="d">${d}</div>` : ''}</div>`)}
        </div>

        <div class="grid g-main mt">
          ${conversionCard()}
          <div class="card">
            <div class="card-h"><h2>Needs attention</h2></div>
            <div class="list">
              <a class="li" href="#/review"><span class="grow"><span class="ttl">Founder review</span><div class="meta">Drafts waiting for approval</div></span><span class="badge ${review.length ? 'b-amber' : ''}">${review.length}</span></a>
              <a class="li" href="#/founder"><span class="grow"><span class="ttl">Ready to send</span><div class="meta">Approved, waiting to be sent by hand</div></span><span class="badge ${ready.length ? 'b-green' : ''}">${ready.length}</span></a>
              <a class="li" href="#/followups"><span class="grow"><span class="ttl">Follow-ups due</span><div class="meta">Day ${PV.settings.outreach.followUpDays.join(' / ')} reminders</div></span><span class="badge ${due.length ? 'b-coral' : ''}">${due.length}</span></a>
            </div>
            <div class="card-h" style="border-top:1px solid var(--line-2)"><h3>Highest-scoring leads not yet researched</h3></div>
            <div class="list">${untouched.length ? untouched.map((l) => html`<a class="li" href="#/research/${l.id}"><span class="avatar">${U.initials(l)}</span><span class="grow"><span class="ttl">${PV.leadName(l)}</span><div class="meta">${l.title} · ${l.company}</div></span>${U.scoreBadge(PV.score(l))}</a>`) : html`<div class="empty small">Nothing waiting for research.</div>`}</div>
          </div>
        </div>`;
    }
  };

  /* ---------------- Intern Workspace ---------------- */

  function internChecklist() {
    const t = PV.today();
    const target = PV.target();
    const isToday = (iso) => iso && E.dayKey(iso) === t;
    const added = PV.leads.filter((l) => isToday(l.milestones.added));
    const ms = (k) => PV.leads.filter((l) => isToday(l.milestones[k])).length;
    return [
      { t: `Find ${target} prospects`, n: added.length, href: '#/finder', hint: 'Lead Finder builds the Google searches' },
      { t: 'Enter prospect details', n: added.filter((l) => !E.missingCore(l).length).length, href: '#/leads?added=today', hint: 'Name, title, company, LinkedIn, industry, location' },
      { t: 'Research company', n: ms('researched'), href: '#/research', hint: 'Paste public facts only. Leave blank if not found' },
      { t: 'Find relevant signals', n: added.filter((l) => E.signalEntries(l).length > 0).length, href: '#/research', hint: 'Hiring, funding, launches, leadership, tech changes' },
      { t: 'Add email', n: added.filter((l) => E.has(l.email)).length, href: '#/leads?added=today', hint: 'Record where it came from' },
      { t: 'Record verification status', n: added.filter((l) => l.emailStatus && l.emailStatus !== 'Unverified').length, href: '#/leads?added=today', hint: 'Valid, risky, catch-all, invalid or not found' },
      { t: 'Generate personalization', n: ms('drafted'), href: '#/email', hint: 'Pick the strongest variation and tidy it' },
      { t: 'Submit for founder review', n: ms('submitted'), href: '#/email', hint: 'The founder approves before anything is sent' }
    ].map((c) => Object.assign(c, { done: c.n >= target, target }));
  }

  PV.views.intern = {
    render() {
      const list = internChecklist();
      const target = PV.target();
      const submitted = list[list.length - 1].n;
      const queue = PV.leads.filter((l) => ['new', 'researching', 'researchComplete', 'drafted'].includes(l.status))
        .map((l) => ({ l, sc: PV.score(l), step: E.nextStep(l) }))
        .sort((a, b) => (a.step.key === 'fix' ? -1 : 0) - (b.step.key === 'fix' ? -1 : 0) || b.sc.total - a.sc.total);
      const stepHref = (l, s) => s.view === 'edit' ? null : s.view === 'lead' ? `#/lead/${l.id}` : `#/${s.view}/${l.id}`;
      return html`
        ${sampleBanner()}
        <div class="page-head"><div><h1>Intern Workspace</h1><p class="sub">Your tasks for today, in order. Find, research, draft, submit. The founder handles approval and sending.</p></div>
          <div class="actions"><a class="btn" href="#/finder">${icon('search')}Open Lead Finder</a><button class="btn primary" data-action="add-lead">${icon('plus')}Add lead</button></div></div>
        <div class="grid g-main-wide">
          <div class="stack">
            <div class="card">
              <div class="card-h"><h2>My queue</h2><span class="sub">${queue.length} lead${queue.length === 1 ? '' : 's'} need${queue.length === 1 ? 's' : ''} your next step, highest score first</span></div>
              ${queue.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>Prospect</th><th>Score</th><th>Status</th><th>Next step</th></tr></thead><tbody>
                ${queue.map(({ l, sc, step }) => html`<tr data-href="#/lead/${l.id}">
                  <td><div class="who"><b>${PV.leadName(l)}</b><span>${l.title || '—'} · ${l.company || '—'}</span></div>${step.key === 'fix' ? html`<div class="small" style="color:var(--red);margin-top:4px">Founder: ${l.founderNote}</div>` : ''}</td>
                  <td>${U.scoreBadge(sc)}</td><td>${U.statusBadge(l.status)}</td>
                  <td>${stepHref(l, step) ? html`<a class="btn sm ${step.key === 'fix' ? 'danger' : 'dark'}" href="${stepHref(l, step)}">${step.label}</a>` : html`<button class="btn sm dark" data-action="edit-lead" data-id="${l.id}">${step.label}</button>`}</td>
                </tr>`)}</tbody></table></div>` : html`<div class="empty"><h3>Queue is clear</h3><p>Add today's prospects from Lead Finder to get started.</p></div>`}
            </div>
            <div class="card">
              <div class="card-h"><h2>With the founder</h2><span class="sub">Submitted and waiting for review</span></div>
              <div class="list">${PV.leads.filter((l) => l.status === 'review').map((l) => html`<a class="li" href="#/lead/${l.id}"><span class="avatar">${U.initials(l)}</span><span class="grow"><span class="ttl">${PV.leadName(l)}</span><div class="meta">${l.company} · submitted ${U.ago(l.milestones.submitted)}</div></span>${U.scoreBadge(PV.score(l))}</a>`)}</div>
              ${PV.leads.some((l) => l.status === 'review') ? '' : html`<div class="empty small">Nothing waiting on the founder.</div>`}
            </div>
          </div>
          <div class="card">
            <div class="card-h"><h2>Daily checklist</h2><div class="right"><span class="badge ${submitted >= target ? 'b-green' : 'b-dark'}">${Math.min(submitted, target)} / ${target} completed</span></div></div>
            <div class="card-b">
              <div class="progress coral mb"><i style="width:${pct(submitted, target)}%"></i></div>
              ${list.map((c) => html`<a class="check ${c.done ? 'done' : ''}" href="${c.href}" style="text-decoration:none">
                <input type="checkbox" ${c.done ? 'checked' : ''} disabled aria-label="${c.t}">
                <div class="grow" style="flex:1"><div class="row between"><span class="t">${c.t}</span><span class="small strong nowrap">${Math.min(c.n, c.target)} / ${c.target}</span></div><div class="tiny muted">${c.hint}</div></div>
              </a>`)}
              <p class="tiny muted mt">Ticks fill in automatically from what you log today.</p>
            </div>
          </div>
        </div>`;
    }
  };

  /* ---------------- Founder Workspace ---------------- */

  PV.views.founder = {
    render() {
      const review = PV.leads.filter((l) => l.status === 'review').map((l) => ({ l, sc: PV.score(l) })).sort((a, b) => b.sc.total - a.sc.total);
      const ready = PV.leads.filter((l) => l.status === 'approved');
      const due = PV.followupsDue();
      const replies = PV.leads.filter((l) => l.status === 'replied' || l.status === 'positive');
      const mins = Math.round(review.length * 2.5 + ready.length * 1.5 + due.length * 1.5);
      return html`
        ${sampleBanner()}
        <div class="page-head"><div><h1>Today's Review</h1><p class="sub">${review.length} prospect${review.length === 1 ? '' : 's'} to review · ${ready.length} ready to send · ${due.length} follow-up${due.length === 1 ? '' : 's'} due. Roughly ${mins} minutes.</p></div>
          <div class="actions">${review.length ? html`<a class="btn primary lg" href="#/review">${icon('review')}Start review (one at a time)</a>` : ''}</div></div>
        <div class="grid g-main-wide">
          <div class="stack">
            ${review.length ? review.map(({ l, sc }) => {
              const opps = E.analyze(l, PV.settings);
              const o = opps[0];
              return html`<div class="card">
                <div class="card-h">${PV.whoLine(l)}<div class="right">${U.scoreBadge(sc)}</div></div>
                <div class="card-b stack-sm">
                  <dl class="kv"><dt>Research</dt><dd>${U.notFound(l.research.description)}</dd>
                  <dt>Signal</dt><dd>${o ? html`<span class="tag fact">Fact</span> ${o.fact}` : U.notFound('')}</dd>
                  <dt>Opportunity</dt><dd>${o ? html`<span class="tag hypothesis">Hypothesis</span> ${o.opportunity}` : U.notFound('')}</dd></dl>
                  <details class="more"><summary>Email: ${l.outreach ? l.outreach.subject : 'no draft'}</summary><div class="copybox mt-sm">${l.outreach ? l.outreach.body : ''}</div></details>
                </div>
                <div class="sticky-actions" style="position:static">
                  <button class="btn good" data-action="approve" data-id="${l.id}">${icon('check')}Approve</button>
                  <a class="btn" href="#/review/${l.id}">${icon('edit')}Edit</a>
                  <button class="btn danger" data-action="reject" data-id="${l.id}">${icon('x')}Reject</button>
                </div>
              </div>`;
            }) : html`<div class="card"><div class="empty"><h3>No drafts waiting</h3><p>When the intern submits drafts, they appear here.</p></div></div>`}
          </div>
          <div class="stack">
            <div class="card">
              <div class="card-h"><h2>Ready to send</h2><span class="sub">Send from your own inbox</span></div>
              <div class="list">${ready.length ? ready.map((l) => html`<div class="li"><div class="grow"><div class="ttl">${PV.leadName(l)}</div><div class="meta">${l.company} · ${l.email || 'no email'}</div>
                <div class="btn-row mt-sm">${PV.mailtoBtn(l)}<button class="btn sm" data-action="copy-email" data-id="${l.id}">${icon('copy')}Copy</button><button class="btn sm dark" data-action="mark-sent" data-id="${l.id}">${icon('send')}Email Sent</button></div></div></div>`)
                : html`<div class="empty small">Nothing approved and unsent.</div>`}</div>
            </div>
            <div class="card">
              <div class="card-h"><h2>Follow-ups due</h2><div class="right"><a class="btn sm" href="#/followups">Open</a></div></div>
              <div class="list">${due.length ? due.slice(0, 6).map(({ lead, fu }) => html`<a class="li" href="#/followups"><span class="grow"><span class="ttl">${PV.leadName(lead)}</span><div class="meta">Follow-up ${fu.n} (day ${fu.day}) · ${lead.company}</div></span><span class="badge b-coral">${U.dueLabel(fu.due)}</span></a>`) : html`<div class="empty small">No follow-ups due.</div>`}</div>
            </div>
            <div class="card">
              <div class="card-h"><h2>Conversations</h2><span class="sub">Replied, needs a response</span></div>
              <div class="list">${replies.length ? replies.map((l) => html`<a class="li" href="#/lead/${l.id}"><span class="grow"><span class="ttl">${PV.leadName(l)}</span><div class="meta">${l.company}</div></span>${U.statusBadge(l.status)}</a>`) : html`<div class="empty small">No open conversations.</div>`}</div>
            </div>
          </div>
        </div>`;
    }
  };
})();
