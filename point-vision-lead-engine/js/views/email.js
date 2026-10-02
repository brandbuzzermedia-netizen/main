/* Email Generator: components, three variations, editor with live checks. */
(function () {
  'use strict';
  const PV = window.PV, E = PV.E, U = PV.U, S = PV.S;
  const { html, icon } = U;

  const VNAMES = { A: 'Version A · Direct', B: 'Version B · Insight-led', C: 'Version C · Founder-to-founder' };
  const VDESC = { A: 'Short and highly concise', B: 'Opens with a business or technical observation', C: 'More conversational and personal' };
  PV.VNAMES = VNAMES;

  // Make sure a lead has generated outreach; never overwrites edits.
  PV.ensureOutreach = (l) => {
    if (l.outreach && l.outreach.variants) return { ok: true };
    const gen = E.generateOutreach(l, PV.settings, { seed: 0 });
    if (gen.blocked) return { ok: false, reason: gen.reason };
    const k = PV.settings.outreach.tone || 'C';
    l.outreach = { variants: gen.variants, components: gen.components, variant: k, subject: gen.variants[k].subject, body: gen.variants[k].body,
      angle: gen.angle, signal: gen.signal, primary: gen.primary.field, seed: 0, generatedAt: gen.generatedAt, edited: false };
    S.saveLead(l, { silent: true });
    return { ok: true };
  };

  PV.regenerate = (id, opts) => {
    const l = S.lead(id);
    const o = l.outreach || {};
    const go = () => PV.mutate(id, (x) => {
      const seed = (o.seed || 0) + 1;
      const primary = (opts && opts.primary) || o.primary;
      const gen = E.generateOutreach(x, PV.settings, { seed, primary });
      if (gen.blocked) { U.toast(gen.reason, 'err'); return; }
      const k = o.variant || PV.settings.outreach.tone || 'C';
      x.outreach = Object.assign({}, o, { variants: gen.variants, components: gen.components, variant: k, subject: gen.variants[k].subject, body: gen.variants[k].body,
        angle: gen.angle, signal: gen.signal, primary: gen.primary.field, seed, generatedAt: gen.generatedAt, edited: false });
      PV.log(x, 'Email regenerated');
    });
    if (o.edited && !(opts && opts.force)) U.confirmBox('Replace your edits?', 'Regenerating rewrites all three variations and replaces the edited draft.', 'Regenerate', go);
    else go();
  };

  PV.live.lint = (el) => {
    const l = S.lead(el.dataset.id);
    if (!l || !l.outreach) return '';
    const res = E.lintEmail(l.outreach.body, l, PV.settings);
    const out = PV.settings.outreach;
    return html`<div class="row between mb"><span class="strong">${res.words} words</span><span class="small muted">Target ${out.minWords}–${out.maxWords}</span></div>
      <div class="progress ${res.words >= out.minWords && res.words <= out.maxWords ? 'green' : 'coral'} mb"><i style="width:${Math.min(100, Math.round(res.words * 100 / out.maxWords))}%"></i></div>
      <div class="lint">${res.issues.length ? res.issues.map((i) => html`<div class="i ${i.level}">${i.text}</div>`) : html`<div class="i ok">Specific opening, right length, no banned phrases, no numbers that aren't in the research.</div>`}</div>`;
  };

  PV.emailEditor = (l, opts) => {
    const o = l.outreach;
    return html`<div data-lead="${l.id}" class="stack-sm">
      <div class="field"><label for="em-subj">Subject</label><input class="input" id="em-subj" data-f="outreach.subject" value="${o.subject}" data-edit></div>
      <div class="field"><label for="em-body">Email${o.edited ? ' (edited)' : ''}</label><textarea class="textarea email" id="em-body" data-f="outreach.body" data-edit>${o.body}</textarea></div>
      ${opts && opts.noLint ? '' : html`<div data-live="lint" data-id="${l.id}">${PV.live.lint({ dataset: { id: l.id } })}</div>`}
    </div>`;
  };
  // Any manual edit marks the draft as edited so regenerate asks first.
  document.addEventListener('input', (e) => {
    if (e.target.dataset && e.target.dataset.edit !== undefined) {
      const host = e.target.closest('[data-lead]');
      const l = host && S.lead(host.dataset.lead);
      if (l && l.outreach) l.outreach.edited = true;
    }
  });

  function variantsHtml(l) {
    const o = l.outreach;
    return html`<div class="variants">${['A', 'B', 'C'].map((k) => {
      const v = o.variants[k];
      return html`<button class="variant ${o.variant === k ? 'on' : ''}" data-action="pick-variant" data-id="${l.id}" data-k="${k}">
        <div class="vh"><span class="strong">${VNAMES[k]}</span><span class="badge b-line" style="margin-left:auto">${v.words} words</span></div>
        <div class="tiny muted">${VDESC[k]}</div>
        <div class="subj">${v.subject}</div>
        <div class="vb">${v.body}</div>
        <span class="btn sm ${o.variant === k ? 'dark' : ''}" style="align-self:flex-start">${o.variant === k ? 'Selected' : 'Use this version'}</span>
      </button>`;
    })}</div>`;
  }

  PV.views.email = {
    render(r) {
      const filter = PV.prefs.pickerFilter || 'open';
      const list = PV.pickerList(r.id, filter).filter(({ l }) => filter === 'all' || ['researchComplete', 'drafted', 'review', 'researching'].includes(l.status) || l.id === r.id);
      const l = r.id ? S.lead(r.id) : (list.find((x) => ['researchComplete', 'drafted'].includes(x.l.status)) || list[0] || {}).l;
      if (!l) return html`<div class="page-head"><div><h1>Email Generator</h1></div></div><div class="card"><div class="empty"><h3>No leads ready for outreach</h3><p>Complete research on a lead first.</p></div></div>`;
      if (!r.id) history.replaceState(null, '', '#/email/' + l.id);
      const ready = PV.ensureOutreach(l);
      const opps = E.analyze(l, PV.settings);
      const head = html`<div class="page-head"><div><h1>Email Generator</h1><p class="sub">Built only from this lead's research and your Settings. Opening line quotes a real observation. Founder-to-founder, 60–120 words, no generic filler.</p></div></div>`;
      if (!ready.ok) {
        return html`${head}<div class="grid g-work">${PV.picker('email', l.id, list, filter)}<div class="card"><div class="card-h">${PV.whoLine(l)}</div><div class="empty"><h3>Nothing to personalise from yet</h3><p>${ready.reason}</p><a class="btn dark mt" href="#/research/${l.id}">${icon('research')}Open research</a></div></div></div>`;
      }
      const o = l.outreach;
      const c = o.components;
      const locked = ['approved', 'sent'].includes(l.status) || E.STAGE_BY_KEY[l.status].index > E.STAGE_BY_KEY.approved.index;
      return html`${head}
        <div class="grid g-work">
          ${PV.picker('email', l.id, list, filter)}
          <div class="stack">
            <div class="card">
              <div class="card-h">${PV.whoLine(l)}<div class="right">${U.statusBadge(l.status)}${U.scoreBadge(PV.score(l))}</div></div>
              <div class="card-b">
                <div class="row wrap mb"><label class="lbl-sm" for="lead-with">Lead with signal</label>
                  <select class="select sm" id="lead-with" data-onchange="lead-with" data-id="${l.id}" style="width:auto;max-width:100%">${opps.map((x) => PV.opt(x.field, o.primary, `${x.fieldLabel} · ${x.confidence}: ${E.shortFact(x.fact, 9)}`))}</select>
                  <button class="btn sm" data-action="regen" data-id="${l.id}" style="margin-left:auto">${icon('refresh')}Regenerate</button></div>
                <dl class="comp">
                  <dt>1 · Personalization hook</dt><dd><span class="tag fact">Fact</span> ${c.hook}</dd>
                  <dt>2 · Problem hypothesis</dt><dd><span class="tag hypothesis">Hypothesis</span> ${c.problem}</dd>
                  <dt>3 · Point Vision relevance</dt><dd>${c.relevance}</dd>
                  <dt>4 · Value proposition</dt><dd>${c.value}</dd>
                  <dt>5 · CTA</dt><dd>${c.cta}</dd>
                </dl>
              </div>
            </div>
            <div><h2 style="margin-bottom:10px">6 · Complete email: three variations</h2>${variantsHtml(l)}</div>
          </div>
          <div class="stack">
            <div class="card">
              <div class="card-h"><h2>Selected draft</h2><span class="sub">${VNAMES[o.variant] || ''}</span></div>
              <div class="card-b">${PV.emailEditor(l)}</div>
              <div class="sticky-actions">
                ${locked ? html`<span class="small muted">Already ${E.STAGE_BY_KEY[l.status].label.toLowerCase()}. Edits are still saved.</span>`
                  : html`<button class="btn" data-action="save-draft" data-id="${l.id}">${icon('save')}Save draft</button>
                  <button class="btn dark" data-action="submit-review" data-id="${l.id}" ${l.status === 'review' ? 'disabled' : ''}>${icon('send')}${l.status === 'review' ? 'With founder' : 'Submit for founder review'}</button>`}
                <button class="btn ghost" data-action="copy-email" data-id="${l.id}">${icon('copy')}Copy</button>
              </div>
            </div>
          </div>
        </div>`;
    }
  };

  Object.assign(PV.actions, {
    'regen': (el) => PV.regenerate(el.dataset.id),
    'lead-with': (el) => PV.regenerate(el.dataset.id, { primary: el.value }),
    'pick-variant': (el) => {
      const l = S.lead(el.dataset.id);
      const go = () => PV.mutate(l.id, (x) => {
        const v = x.outreach.variants[el.dataset.k];
        Object.assign(x.outreach, { variant: el.dataset.k, subject: v.subject, body: v.body, edited: false });
      });
      if (l.outreach.edited && l.outreach.variant !== el.dataset.k) U.confirmBox('Switch version?', 'Your edits to the current draft will be replaced.', 'Switch', go);
      else go();
    },
    'save-draft': (el) => {
      PV.mutate(el.dataset.id, (l) => { if (E.STAGE_BY_KEY[l.status].index < E.STAGE_BY_KEY.drafted.index) { l.status = 'drafted'; } PV.stamp(l, 'researched'); PV.stamp(l, 'drafted'); });
      U.toast('Draft saved');
    },
    'submit-review': (el) => {
      const l = S.lead(el.dataset.id);
      const lint = E.lintEmail(l.outreach.body, l, PV.settings);
      const doIt = () => {
        PV.mutate(l.id, (x) => { PV.stamp(x, 'researched'); PV.stamp(x, 'drafted'); x.status = 'review'; PV.stamp(x, 'submitted'); x.founderNoteResolved = true; });
        U.toast('Submitted for founder review');
        const next = PV.leads.find((x) => x.status === 'researchComplete' || x.status === 'drafted');
        if (next) PV.go('#/email/' + next.id);
      };
      if (!lint.ok) U.confirmBox('Submit with problems?', lint.issues.filter((i) => i.level === 'error').map((i) => i.text).join(' '), 'Submit anyway', doIt);
      else doIt();
    },
    'copy-email': (el) => {
      const l = S.lead(el.dataset.id);
      U.copy(`Subject: ${l.outreach.subject}\n\n${l.outreach.body}`, 'Email');
    }
  });
})();
