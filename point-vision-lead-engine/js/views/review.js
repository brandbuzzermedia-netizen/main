/* Founder Review: one prospect at a time. The founder is the final decision-maker. */
(function () {
  'use strict';
  const PV = window.PV, E = PV.E, U = PV.U, S = PV.S;
  const { html, icon } = U;

  const queue = () => PV.leads.filter((l) => l.status === 'review').map((l) => ({ l, sc: PV.score(l) })).sort((a, b) => b.sc.total - a.sc.total).map((x) => x.l);

  function nextAfter(id) {
    const q = queue().filter((l) => l.id !== id);
    return q[0] || null;
  }

  PV.views.review = {
    render(r) {
      const q = queue();
      let l = r.id ? S.lead(r.id) : q[0];
      const head = (sub) => html`<div class="page-head"><div><h1>Founder Review</h1><p class="sub">${sub}</p></div></div>`;
      if (!l) {
        const ready = PV.leads.filter((x) => x.status === 'approved').length;
        return html`${head('Nothing is sent without your approval.')}<div class="card"><div class="empty"><h3>Review queue is empty</h3><p>${ready ? `${ready} approved email${ready === 1 ? ' is' : 's are'} ready to send from the Founder Workspace.` : 'Drafts submitted by the intern will appear here.'}</p>
          <div class="btn-row mt" style="justify-content:center"><a class="btn dark" href="#/founder">Founder Workspace</a></div></div></div>`;
      }
      if (!r.id) history.replaceState(null, '', '#/review/' + l.id);
      PV.ensureOutreach(l);
      const idx = q.findIndex((x) => x.id === l.id);
      const sc = PV.score(l);
      const opps = E.analyze(l, PV.settings);
      const o = opps[0];
      const rs = l.research;
      const inQueue = l.status === 'review';
      const prev = idx > 0 ? q[idx - 1] : null;
      const next = idx >= 0 && idx < q.length - 1 ? q[idx + 1] : null;
      return html`
        <div class="page-head"><div><h1>Founder Review</h1><p class="sub">${inQueue ? `Prospect ${idx + 1} of ${q.length}. Highest score first.` : `This lead is ${E.STAGE_BY_KEY[l.status].label.toLowerCase()}, not in the review queue.`} Nothing is sent without your approval.</p></div>
          <div class="actions queue-nav">${prev ? html`<a class="btn" href="#/review/${prev.id}">${icon('arrowL')}Previous</a>` : ''}${next ? html`<a class="btn" href="#/review/${next.id}">Next${icon('arrowR')}</a>` : ''}</div></div>
        <div class="grid g-main-wide">
          <div class="stack">
            <div class="card">
              <div class="card-b review-head">
                <span class="avatar" style="width:48px;height:48px;font-size:16px">${U.initials(l)}</span>
                <div class="who grow"><h2>${PV.leadName(l)}</h2><div class="muted">${l.title} · <b style="color:var(--ink)">${l.company}</b> · ${l.location}</div></div>
                <div class="row">${U.priorityBadge(sc)}${U.scoreBadge(sc, true)}</div>
              </div>
              <div class="card-b" style="border-top:1px solid var(--line-2)"><dl class="kv">
                <dt>Prospect</dt><dd>${PV.leadName(l)}${l.linkedin ? html` · <a href="${l.linkedin}" target="_blank" rel="noopener">LinkedIn profile ↗</a>` : ''}</dd>
                <dt>Role</dt><dd>${U.notFound(l.title)}</dd>
                <dt>Company</dt><dd>${l.company}${l.website ? html` · <a href="${l.website}" target="_blank" rel="noopener">${l.website.replace(/^https?:\/\//, '')}</a>` : ''} · ${U.notFound(l.industry)} · ${U.notFound(l.companySize)}</dd>
                <dt>Email</dt><dd>${l.email || U.notFound('')} ${U.emailBadge(l.emailStatus)} <span class="muted small">${l.emailSource ? 'via ' + l.emailSource : ''}</span></dd>
              </dl></div>
            </div>
            <div class="card"><div class="card-h"><h2>Company research</h2><a class="btn sm ghost" href="#/research/${l.id}" style="margin-left:auto">Open research</a></div><div class="card-b"><dl class="kv">
              <dt>Description</dt><dd>${U.notFound(rs.description)}</dd>
              <dt>Products</dt><dd>${U.notFound(rs.products)}</dd>
              ${E.signalEntries(l).map((s) => html`<dt>${E.FIELD[s.field].label}</dt><dd>${s.text}</dd>`)}
              <dt>Sources</dt><dd class="small">${U.notFound(rs.sources)}</dd>
            </dl></div></div>
            <div class="card"><div class="card-h"><h2>Opportunity</h2>${o ? U.confBadge(o.confidence) : ''}</div><div class="card-b">
              ${o ? html`<div class="opp" style="border:0;padding:0">
                <div class="ln"><span class="tag fact">Fact</span><span class="strong">Observed signal.</span> ${o.fact}</div>
                <div class="ln"><span class="tag inference">Inference</span><span class="strong">Potential challenge.</span> ${o.challenge}</div>
                <div class="ln"><span class="tag hypothesis">Hypothesis</span><span class="strong">Point Vision opportunity.</span> ${o.opportunity}</div></div>
                ${opps.length > 1 ? html`<details class="more mt-sm"><summary>${opps.length - 1} more signal${opps.length > 2 ? 's' : ''}</summary>${opps.slice(1).map((x) => html`<div class="opp mt-sm"><div class="ln"><span class="tag fact">Fact</span>${x.fact}</div><div class="ln"><span class="tag hypothesis">Hypothesis</span>${x.opportunity}</div><div class="src mt-sm">${x.confidence} confidence</div></div>`)}</details>` : ''}`
                : html`<p class="notfound">Not Found</p>`}
              <div class="field mt" data-lead="${l.id}"><label for="fi">Your technical / business insight (optional)</label>
                <textarea class="textarea" id="fi" data-f="founderInsight" rows="2" placeholder="e.g. We rebuilt a similar onboarding flow last year. Mention the document intake step. Click Regenerate to work it into the email.">${l.founderInsight || ''}</textarea></div>
            </div></div>
          </div>
          <div class="stack">
            <div class="card">
              <div class="card-h"><h2>Email draft</h2><div class="right"><div class="seg">${['A', 'B', 'C'].map((k) => html`<button class="${l.outreach.variant === k ? 'on' : ''}" data-action="pick-variant" data-id="${l.id}" data-k="${k}" title="${PV.VNAMES[k]}">${k}</button>`)}</div></div></div>
              <div class="card-b">${PV.emailEditor(l)}</div>
              <div class="sticky-actions">
                <button class="btn good" data-action="approve" data-id="${l.id}">${icon('check')}Approve</button>
                <button class="btn" data-action="focus-editor">${icon('edit')}Edit</button>
                <button class="btn" data-action="regen" data-id="${l.id}">${icon('refresh')}Regenerate</button>
                <button class="btn danger" data-action="reject" data-id="${l.id}">${icon('x')}Reject</button>
                <button class="btn" data-action="review-save" data-id="${l.id}">${icon('save')}Save</button>
                <button class="btn dark" data-action="ready-to-send" data-id="${l.id}">${icon('send')}Mark Ready to Send</button>
              </div>
            </div>
            <p class="tiny muted">Approve keeps it in your send list. Mark Ready to Send approves it and opens the send step. Either way, you send it yourself from your inbox.</p>
          </div>
        </div>`;
    }
  };

  function approve(id, ready) {
    PV.mutate(id, (l) => {
      if (E.STAGE_BY_KEY[l.status].index < E.STAGE_BY_KEY.approved.index) l.status = 'approved';
      PV.stamp(l, 'submitted');
      PV.stamp(l, 'approved');
      if (ready) { l.outreach.readyToSend = true; PV.log(l, 'Marked ready to send'); }
    }, { silent: true });
  }

  Object.assign(PV.actions, {
    'approve': (el) => {
      const id = el.dataset.id;
      const next = nextAfter(id);
      approve(id);
      U.toast('Approved. Added to your send list');
      if (location.hash.startsWith('#/review')) PV.go(next ? '#/review/' + next.id : '#/review'); else PV.render();
    },
    'ready-to-send': (el) => {
      approve(el.dataset.id, true);
      U.toast('Ready to send. Send it from your inbox, then log it');
      PV.go('#/lead/' + el.dataset.id);
    },
    'review-save': (el) => { PV.mutate(el.dataset.id, () => {}); U.toast('Saved'); },
    'focus-editor': () => { const t = document.getElementById('em-body'); if (t) { t.focus(); t.scrollIntoView({ block: 'center' }); } },
    'reject': (el) => {
      const id = el.dataset.id;
      const l = S.lead(id);
      const ov = U.modal(html`<form id="rej"><div class="mh"><h2>Reject ${PV.leadName(l)}</h2><button type="button" class="x-btn" data-action="close-modal" aria-label="Close">×</button></div>
        <div class="mb stack-sm">
          <label class="check"><input type="radio" name="mode" value="back" checked><div><div class="t">Send back to the intern</div><div class="tiny muted">Needs more research or a better draft. Your note shows on their queue.</div></div></label>
          <label class="check"><input type="radio" name="mode" value="lost"><div><div class="t">Disqualify</div><div class="tiny muted">Not a fit. Moves the lead to Lost.</div></div></label>
          <div class="field mt-sm"><label for="rej-note">Note</label><textarea class="textarea" id="rej-note" name="note" placeholder="e.g. Signal is 8 months old. Find something recent." autofocus></textarea></div>
        </div>
        <div class="mf"><button type="button" class="btn" data-action="close-modal">Cancel</button><button class="btn danger" type="submit">Reject</button></div></form>`, { center: true });
      ov.querySelector('#rej').addEventListener('submit', (e) => {
        e.preventDefault();
        const mode = e.target.mode.value;
        const note = e.target.note.value.trim();
        const next = nextAfter(id);
        PV.mutate(id, (x) => {
          if (mode === 'lost') { x.status = 'lost'; PV.stamp(x, 'lost'); PV.log(x, 'Disqualified in founder review' + (note ? ': ' + note : '')); }
          else { x.status = 'researching'; x.founderNote = note || 'Rejected in review. Needs another pass.'; x.founderNoteResolved = false; PV.log(x, 'Sent back by founder' + (note ? ': ' + note : '')); }
        }, { silent: true });
        U.closeModal();
        U.toast(mode === 'lost' ? 'Disqualified' : 'Sent back to intern');
        if (location.hash.startsWith('#/review')) PV.go(next ? '#/review/' + next.id : '#/review'); else PV.render();
      });
    },
    'mark-sent': (el) => {
      PV.mutate(el.dataset.id, (l) => {
        l.status = 'sent'; PV.stamp(l, 'approved'); PV.stamp(l, 'sent'); l.linkedinChecklist.emailSent = true;
      }, { silent: true });
      U.toast('Logged as sent. LinkedIn follow-up is next');
      PV.go('#/lead/' + el.dataset.id);
    }
  });
})();
