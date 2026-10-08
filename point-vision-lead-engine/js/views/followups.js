/* Follow-ups: today's manual outbound tasks. Nothing here sends anything. */
(function () {
  'use strict';
  const PV = window.PV, E = PV.E, U = PV.U;
  const { html, icon } = U;

  PV.views.followups = {
    render() {
      const today = PV.today();
      const all = PV.leads.map((l) => ({ lead: l, fu: E.nextFollowUp(l, PV.settings) })).filter((x) => x.fu);
      const due = all.filter((x) => x.fu.due <= today).sort((a, b) => a.fu.due.localeCompare(b.fu.due));
      const upcoming = all.filter((x) => x.fu.due > today).sort((a, b) => a.fu.due.localeCompare(b.fu.due));
      const ready = PV.leads.filter((l) => l.status === 'approved');
      const liTodo = PV.leads.filter((l) => l.milestones.sent && !E.STOP_FOLLOWUPS.includes(l.status) && !(l.linkedinChecklist || {}).requestSent);
      const days = PV.settings.outreach.followUpDays;
      return html`
        <div class="page-head"><div><h1>Follow-ups</h1><p class="sub">Reminders on day ${days.join(', ')} after the first email, written from the original research. Copy, send it yourself, then log it. They stop once a prospect replies.</p></div></div>
        <div class="kpis mb">
          <div class="kpi"><div class="k">Due today / overdue</div><div class="v">${due.length}</div></div>
          <div class="kpi"><div class="k">Ready to send</div><div class="v">${ready.length}</div></div>
          <div class="kpi"><div class="k">LinkedIn requests to send</div><div class="v">${liTodo.length}</div></div>
          <div class="kpi"><div class="k">Upcoming</div><div class="v">${upcoming.length}</div></div>
        </div>
        <div class="grid g-main-wide">
          <div class="stack">
            <h2>Due now</h2>
            ${due.length ? due.map(({ lead: l, fu }) => html`<div class="card">
              <div class="card-h">${PV.whoLine(l)}<div class="right"><span class="badge b-coral">${U.dueLabel(fu.due)}</span></div></div>
              <div class="card-b stack-sm">
                <div class="row wrap"><span class="strong">Follow-up ${fu.n} · Day ${fu.day}</span><span class="small muted">${fu.label}</span><span class="small muted" style="margin-left:auto">First email ${U.shortDate(l.milestones.sent)}</span></div>
                <div class="small muted">Subject: ${fu.subject}</div>
                ${PV.copyBlock('due-' + l.id, fu.body, 'Follow-up')}
                <div class="btn-row">${PV.mailtoBtn(l, fu.subject, fu.body)}<button class="btn sm dark" data-action="fu-done" data-id="${l.id}" data-n="${fu.n}">${icon('check')}Mark sent</button>
                  <button class="btn sm ghost" data-action="fu-skip" data-id="${l.id}" data-n="${fu.n}">Skip</button>
                  <button class="btn sm" data-action="status" data-id="${l.id}" data-to="replied" style="margin-left:auto">They replied</button></div>
              </div></div>`) : html`<div class="card"><div class="empty"><h3>No follow-ups due</h3><p>Nice. Check the upcoming list on the right.</p></div></div>`}
          </div>
          <div class="stack">
            <div class="card"><div class="card-h"><h2>Ready to send</h2><span class="sub">Approved first emails</span></div>
              <div class="list">${ready.length ? ready.map((l) => html`<div class="li"><div class="grow"><div class="ttl">${PV.leadName(l)}</div><div class="meta">${l.company}</div>
                <div class="btn-row mt-sm">${PV.mailtoBtn(l)}<button class="btn sm" data-action="copy-email" data-id="${l.id}">${icon('copy')}Copy</button><button class="btn sm dark" data-action="mark-sent" data-id="${l.id}">Email Sent</button></div></div></div>`) : html`<div class="empty small">Nothing waiting.</div>`}</div></div>
            <div class="card"><div class="card-h"><h2>LinkedIn connection requests</h2></div>
              <div class="card-b tiny muted" style="padding-bottom:0">Default: a simple request, no pitch. Send it by hand on LinkedIn.</div>
              <div class="list">${liTodo.length ? liTodo.map((l) => html`<div class="li"><div class="grow"><div class="ttl">${PV.leadName(l)}</div><div class="meta">${l.company}</div>
                <div class="btn-row mt-sm">${l.linkedin ? html`<a class="btn sm" href="${l.linkedin}" target="_blank" rel="noopener">${icon('linkedin')}Open LinkedIn</a>` : ''}<button class="btn sm dark" data-action="li-requested" data-id="${l.id}">Request sent</button></div></div></div>`) : html`<div class="empty small">All caught up.</div>`}</div></div>
            <div class="card"><div class="card-h"><h2>Upcoming</h2></div>
              <div class="list">${upcoming.length ? upcoming.map(({ lead: l, fu }) => html`<a class="li" href="#/lead/${l.id}"><span class="grow"><span class="ttl">${PV.leadName(l)}</span><div class="meta">Follow-up ${fu.n} · ${l.company}</div></span><span class="badge">${U.shortDate(fu.due)}</span></a>`) : html`<div class="empty small">Nothing scheduled.</div>`}</div></div>
          </div>
        </div>`;
    }
  };

  PV.actions['li-requested'] = (el) => {
    PV.mutate(el.dataset.id, (l) => { l.linkedinChecklist.requestSent = true; PV.stamp(l, 'linkedinRequested'); });
    U.toast('LinkedIn request logged');
  };
})();
