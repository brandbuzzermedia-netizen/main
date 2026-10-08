/* Weekly analytics. Every number is calculated from logged activity. Nothing is estimated. */
(function () {
  'use strict';
  const PV = window.PV, E = PV.E, U = PV.U;
  const { html, icon } = U;

  const rate = (g) => `${g.replied} of ${g.sent} replied (${Math.round(g.replyRate * 100)}%)${g.positive ? ` · ${g.positive} positive` : ''}`;

  function insight(label, res, empty) {
    const t = res && res.top;
    return html`<div class="insight"><div class="k">${label}</div>
      ${t ? html`<div class="v">${t.label}</div><div class="d">${rate(t)}</div>` : html`<div class="v notfound" style="font-size:14px">${empty || 'Not enough data yet'}</div><div class="d">Needs at least one reply in this period</div>`}
      ${res && res.all.length > 1 ? html`<details class="more mt-sm"><summary>All ${res.all.length}</summary><table class="t plain small"><tbody>${res.all.map((g) => html`<tr><td>${g.label}</td><td class="num">${g.replied}/${g.sent}</td><td class="num">${Math.round(g.replyRate * 100)}%</td></tr>`)}</tbody></table></details>` : ''}
    </div>`;
  }

  PV.views.analytics = {
    render() {
      const offset = PV.prefs.weekOffset || 0;
      const scope = PV.prefs.insightScope || 'week';
      const ref = E.addDays(new Date(), offset * 7);
      const rep = E.weeklyReport(PV.leads, ref, PV.settings, scope);
      const t = rep.totals;
      const ws = E.startOfWeek(ref);
      const days = Array.from({ length: 7 }, (_, i) => E.addDays(ws, i));
      const label = `${U.shortDate(rep.from)} – ${U.shortDate(rep.to)}`;
      const I = rep.insights;
      return html`
        <div class="page-head"><div><h1>Weekly report</h1><p class="sub">${label}${offset === 0 ? ' (this week)' : ''}. Calculated only from activity logged in the app. No estimates, no benchmarks.</p></div>
          <div class="actions"><button class="btn" data-action="week" data-d="-1">${icon('arrowL')}Previous</button>${offset ? html`<button class="btn" data-action="week" data-d="0">This week</button>` : ''}<button class="btn" data-action="week" data-d="1" ${offset >= 0 ? 'disabled' : ''}>Next${icon('arrowR')}</button><button class="btn" data-action="export-week">${icon('download')}Export</button></div></div>
        <div class="kpis">
          ${[['Prospects researched', t.researched], ['Emails sent', t.sent], ['LinkedIn connections', t.connected], ['Replies', t.replies], ['Positive replies', t.positive],
            ['Meetings', t.meetings], ['Qualified opportunities', t.qualified], ['Proposals', t.proposals], ['Won deals', t.won]].map(([k, v]) => html`<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div></div>`)}
        </div>

        <div class="row between mt" style="margin-top:26px;margin-bottom:10px;flex-wrap:wrap;gap:10px"><div><h2>What is working</h2><p class="small muted">${scope === 'all' ? 'All emails sent to date' : 'Emails sent this week'}: ${rep.sample}. Ranked by positive-reply rate, then reply rate.</p></div>
          <div class="seg"><button class="${scope !== 'all' ? 'on' : ''}" data-action="scope" data-v="week">This week</button><button class="${scope === 'all' ? 'on' : ''}" data-action="scope" data-v="all">All time</button></div></div>
        <div class="grid g3">
          ${insight('Top-performing industry', I.industry)}
          ${insight('Top-performing job title', I.title)}
          ${insight('Top personalization angle', I.angle)}
          ${insight('Top opportunity signal', I.signal)}
          <div class="insight"><div class="k">Most common pain point</div>${I.pain ? html`<div class="v">${I.pain.name}</div><div class="d">Seen in ${I.pain.count} of ${I.pain.of} researched lead${I.pain.of === 1 ? '' : 's'}. <span class="tag inference">Inference</span> ${I.pain.challenge}</div>` : html`<div class="v notfound" style="font-size:14px">Not enough data yet</div><div class="d">Needs completed research in this period</div>`}</div>
          ${insight('Best-performing email variation', I.variation)}
        </div>

        <div class="card mt" style="margin-top:22px"><div class="card-h"><h2>Day by day</h2></div><div class="table-wrap"><table class="t plain"><thead><tr><th>Day</th>${E.ACTIVITY.map(([, l]) => html`<th class="num">${l}</th>`)}</tr></thead><tbody>
          ${days.map((d) => { const k = E.dayKey(d); const a = E.activity(PV.leads, k, k); return html`<tr><td class="nowrap strong">${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</td>${E.ACTIVITY.map(([m]) => html`<td class="num ${a[m] ? '' : 'faint'}">${a[m]}</td>`)}</tr>`; })}
        </tbody></table></div></div>`;
    }
  };

  Object.assign(PV.actions, {
    'week': (el) => { const d = Number(el.dataset.d); PV.prefs.weekOffset = d === 0 ? 0 : Math.min(0, (PV.prefs.weekOffset || 0) + d); PV.savePrefs(); PV.render(); },
    'scope': (el) => { PV.prefs.insightScope = el.dataset.v; PV.savePrefs(); PV.render(); },
    'export-week': () => {
      const rep = E.weeklyReport(PV.leads, E.addDays(new Date(), (PV.prefs.weekOffset || 0) * 7), PV.settings, PV.prefs.insightScope);
      const t = rep.totals;
      const lines = [['Point Vision weekly outbound report', rep.from + ' to ' + rep.to], [], ['Metric', 'Value'],
        ['Prospects researched', t.researched], ['Emails sent', t.sent], ['LinkedIn connections', t.connected], ['Replies', t.replies], ['Positive replies', t.positive],
        ['Meetings', t.meetings], ['Qualified opportunities', t.qualified], ['Proposals', t.proposals], ['Won deals', t.won], [],
        ['Insight', 'Top', 'Replied', 'Sent']];
      [['Industry', rep.insights.industry], ['Job title', rep.insights.title], ['Personalization angle', rep.insights.angle], ['Opportunity signal', rep.insights.signal], ['Email variation', rep.insights.variation]]
        .forEach(([k, r]) => lines.push([k, r.top ? r.top.label : 'Not enough data', r.top ? r.top.replied : '', r.top ? r.top.sent : '']));
      lines.push(['Most common pain point', rep.insights.pain ? rep.insights.pain.name : 'Not enough data', rep.insights.pain ? rep.insights.pain.count : '', '']);
      U.download(`point-vision-week-${rep.from}.csv`, E.toCSV(lines), 'text/csv');
    }
  });
})();
