/* Research workspace: paste public facts, see opportunities and score update live. */
(function () {
  'use strict';
  const PV = window.PV, E = PV.E, U = PV.U, S = PV.S;
  const { html, icon } = U;

  // Leads that still need research come first, then by score.
  function pickerList(currentId, filter) {
    const order = { new: 0, researching: 1, researchComplete: 2, drafted: 3, review: 4 };
    return PV.leads
      .filter((l) => filter === 'all' || order[l.status] !== undefined || l.id === currentId)
      .map((l) => ({ l, sc: PV.score(l) }))
      .sort((a, b) => ((order[a.l.status] ?? 9) - (order[b.l.status] ?? 9)) || b.sc.total - a.sc.total);
  }
  PV.pickerList = pickerList;

  PV.picker = (route, currentId, list, filter) => html`<div class="card picker-card">
    <div class="card-h"><h3>Prospects</h3><div class="right"><div class="seg"><button class="${filter !== 'all' ? 'on' : ''}" data-action="picker-filter" data-v="open">Open</button><button class="${filter === 'all' ? 'on' : ''}" data-action="picker-filter" data-v="all">All</button></div></div></div>
    <div class="list picker">${list.map(({ l, sc }) => html`<a class="li ${l.id === currentId ? 'on' : ''}" href="#/${route}/${l.id}">
      <span class="grow"><span class="ttl">${PV.leadName(l)}</span><div class="meta">${l.company} · ${E.STAGE_BY_KEY[l.status].label}</div></span>${U.scoreBadge(sc)}</a>`)}
      ${list.length ? '' : html`<div class="empty small">No open leads.</div>`}
    </div></div>`;
  PV.actions['picker-filter'] = (el) => { PV.prefs.pickerFilter = el.dataset.v; PV.savePrefs(); PV.render(); };

  const g = (q) => 'https://www.google.com/search?q=' + encodeURIComponent(q);

  function quickLinks(l) {
    const c = '"' + (l.company || '') + '"';
    const links = [
      l.website ? ['Website', l.website] : null,
      l.linkedin ? ['LinkedIn profile', l.linkedin] : null,
      ['Company news', g(`${c} (announces OR raises OR launches OR appoints OR partners)`) + '&tbs=qdr:y'],
      ['Job openings', g(`${c} (careers OR jobs OR hiring) (automation OR operations OR engineer)`)],
      ['LinkedIn company page', g(`site:linkedin.com/company ${c}`)],
      ['Interviews / podcasts', g(`"${PV.leadName(l)}" ${c} (interview OR podcast OR panel)`)],
      ['Tech stack mentions', g(`${c} (salesforce OR hubspot OR aws OR azure OR snowflake OR "tech stack")`)]
    ].filter(Boolean);
    return html`<div class="chips">${links.map(([t, u]) => html`<a class="chip" href="${u}" target="_blank" rel="noopener">${t} ${icon('ext')}</a>`)}</div>`;
  }

  function field(l, f) {
    const v = l.research[f.key] || '';
    return html`<div class="field ${f.key === 'description' || f.key === 'products' ? 'full' : ''}"><label for="r-${f.key}">${f.label}</label>
      <textarea class="textarea" id="r-${f.key}" data-f="research.${f.key}" rows="2" placeholder="${f.placeholder || 'Paste what you found, with the date and source. Leave blank if not found.'}">${v}</textarea></div>`;
  }

  function filled(l, sec) {
    return sec.fields.filter((f) => E.has(l.research[f.key])).length;
  }

  // Live panels ------------------------------------------------------------

  PV.live['score-parts'] = (el) => {
    const l = S.lead(el.dataset.id);
    if (!l) return '';
    const sc = PV.score(l);
    return html`<div class="row between mb"><div><div class="strong">${sc.total} / 100</div><div class="tiny muted">${sc.overridden ? `Manual score (calculated ${sc.calculated})` : 'Internal prioritisation only'}</div></div>${U.priorityBadge(sc)}</div>
      <div class="score-parts">${sc.parts.map((p) => html`<div class="p"><span class="lab">${p.label}</span><span class="pts">${Math.round(p.score)} / ${p.max}</span><div class="progress"><i style="width:${Math.round(p.frac * 100)}%"></i></div><span class="why">${p.why}</span></div>`)}</div>`;
  };

  PV.live['opportunities'] = (el) => {
    const l = S.lead(el.dataset.id);
    if (!l) return '';
    const opps = E.analyze(l, PV.settings);
    if (!opps.length) {
      return html`<div class="empty small"><h3>No signals yet</h3><p>Paste observed facts into Recent, Hiring, Technology or Executive signals. Opportunities appear here as you type. Nothing is ever filled in for you.</p></div>`;
    }
    return html`${opps.map((o) => html`<div class="opp">
      <div class="row between" style="margin-bottom:8px"><span class="small strong">${o.ruleName}</span>${U.confBadge(o.confidence)}</div>
      <div class="ln"><span class="tag fact">Fact</span><span class="strong">Observed signal.</span> ${o.fact}</div>
      <div class="ln"><span class="tag inference">Inference</span><span class="strong">Possible business challenge.</span> ${o.challenge}</div>
      <div class="ln"><span class="tag hypothesis">Hypothesis</span><span class="strong">Potential Point Vision opportunity.</span> ${o.opportunity} <span class="muted">(${o.service})</span></div>
      <div class="src mt-sm">Source field: ${o.fieldLabel}${o.corroborated ? ' · corroborated by another signal' : ''}</div>
    </div>`)}`;
  };

  PV.live['hiring-summary'] = (el) => {
    const l = S.lead(el.dataset.id);
    const t = l ? E.hiringText(l.research.hiringRoles) : '';
    return t ? html`<div class="small"><span class="tag fact">Fact</span>${l.company} is hiring ${t}.</div>` : html`<div class="small notfound">Not Found</div>`;
  };

  PV.live['research-progress'] = (el) => {
    const l = S.lead(el.dataset.id);
    const n = E.filledResearchCount(l);
    const sig = E.signalEntries(l).length;
    return html`<span class="badge ${sig ? 'b-green' : ''}">${sig} signal${sig === 1 ? '' : 's'}</span> <span class="badge b-line">${n} field${n === 1 ? '' : 's'} filled</span>`;
  };

  // View --------------------------------------------------------------------

  PV.views.research = {
    render(r) {
      const filter = PV.prefs.pickerFilter || 'open';
      const list = pickerList(r.id, filter);
      const l = r.id ? S.lead(r.id) : (list[0] && list[0].l);
      if (!l) return html`<div class="page-head"><div><h1>Research</h1></div></div><div class="card"><div class="empty"><h3>No leads to research</h3><p>Add a lead first.</p><button class="btn primary mt" data-action="add-lead">Add lead</button></div></div>`;
      if (!r.id) history.replaceState(null, '', '#/research/' + l.id);
      const hasSignal = E.signalEntries(l).length > 0;
      const done = !!l.milestones.researched;
      return html`
        <div class="page-head"><div><h1>Research</h1><p class="sub">Paste publicly available information only. If you cannot verify something, leave it blank: it shows as <span class="notfound">Not Found</span>, and nothing is invented to fill the gap.</p></div></div>
        <div class="grid g-work">
          ${PV.picker('research', l.id, list, filter)}
          <div class="card" data-lead="${l.id}">
            <div class="card-h">${PV.whoLine(l)}<div class="right" data-live="research-progress" data-id="${l.id}">${PV.live['research-progress']({ dataset: { id: l.id } })}</div></div>
            ${l.founderNote && !l.founderNoteResolved ? html`<div class="card-b" style="background:var(--red-soft);color:var(--red)"><b>Founder feedback:</b> ${l.founderNote} <button class="btn sm" data-action="resolve-note" data-id="${l.id}">Mark fixed</button></div>` : ''}
            <div class="card-b" style="border-bottom:1px solid var(--line-2)"><div class="lbl-sm mb" style="margin-bottom:8px">Quick research links (open in a new tab)</div>${quickLinks(l)}</div>
            ${E.RESEARCH.map((sec, i) => html`<div class="rsec">
              <div class="h"><h3>${sec.title}</h3><span class="hint">${sec.hint}</span><span class="filled-count">${filled(l, sec)} / ${sec.fields.length}</span></div>
              ${i === 0 ? html`<div class="form" style="padding-bottom:0"><dl class="kv full"><dt>Industry</dt><dd>${U.notFound(l.industry)}</dd><dt>Location</dt><dd>${U.notFound(l.location)}</dd><dt>Company size</dt><dd>${U.notFound(l.companySize)} <button class="btn sm ghost" data-action="edit-lead" data-id="${l.id}">Edit</button></dd></dl></div>` : ''}
              <div class="form">${sec.fields.map((f) => field(l, f))}</div>
              ${sec.section === 'signals' ? html`<div class="rsec"><div class="h"><h3>Hiring Signals</h3><span class="hint">Relevant open roles you saw on their careers page or a job board.</span></div>
                <div style="padding:8px 18px 16px">
                  ${(l.research.hiringRoles || []).map((h, j) => html`<div class="hiring-row">
                    <input class="input sm" data-f="research.hiringRoles.${j}.role" value="${h.role}" placeholder="Role, e.g. Automation Engineer" aria-label="Role">
                    <input class="input sm" data-f="research.hiringRoles.${j}.count" value="${h.count}" placeholder="#" aria-label="How many">
                    <input class="input sm src" data-f="research.hiringRoles.${j}.source" value="${h.source}" placeholder="Source and date" aria-label="Source">
                    <button class="btn sm ghost" data-action="hiring-remove" data-id="${l.id}" data-i="${j}" aria-label="Remove role">×</button></div>`)}
                  <div class="row between"><button class="btn sm" data-action="hiring-add" data-id="${l.id}">${icon('plus')}Add role</button><div data-live="hiring-summary" data-id="${l.id}">${PV.live['hiring-summary']({ dataset: { id: l.id } })}</div></div>
                </div></div>` : ''}
            </div>`)}
            <div class="rsec"><div class="h"><h3>Sources</h3><span class="hint">Links you used, so the founder can check.</span></div><div class="form"><div class="field full"><textarea class="textarea" data-f="research.sources" rows="2" placeholder="One link per line">${l.research.sources || ''}</textarea></div></div></div>
            ${E.has(l.founderInsight) ? html`<div class="rsec"><div class="h"><h3>Founder insight</h3></div><div class="card-b small">${l.founderInsight}</div></div>` : ''}
            <div class="sticky-actions">
              ${done ? html`<span class="badge b-green">Research complete</span><a class="btn dark" href="#/email/${l.id}">${icon('mail')}Generate email</a>`
                : html`<button class="btn dark" data-action="research-done" data-id="${l.id}" ${hasSignal ? '' : 'title="Add at least one signal first"'}>${icon('check')}Mark research complete</button><span class="small muted">${hasSignal ? 'You can still edit afterwards.' : 'Add at least one observed signal first.'}</span>`}
              <a class="btn ghost" href="#/lead/${l.id}" style="margin-left:auto">Open lead</a>
            </div>
          </div>
          <div class="stack">
            <div class="card"><div class="card-h"><h2>Opportunities</h2><span class="sub">Updates as you type</span></div>
              <div class="card-b"><div class="legend mb"><span><span class="tag fact">Fact</span> What you observed, word for word</span><span><span class="tag inference">Inference</span> What it could indicate</span><span><span class="tag hypothesis">Hypothesis</span> Where Point Vision might help. Confirm before claiming it</span></div>
              <div data-live="opportunities" data-id="${l.id}">${PV.live.opportunities({ dataset: { id: l.id } })}</div></div></div>
            <div class="card"><div class="card-h"><h2>Lead score</h2></div><div class="card-b" data-live="score-parts" data-id="${l.id}">${PV.live['score-parts']({ dataset: { id: l.id } })}</div></div>
          </div>
        </div>`;
    }
  };

  Object.assign(PV.actions, {
    'hiring-add': (el) => PV.mutate(el.dataset.id, (l) => { l.research.hiringRoles = l.research.hiringRoles || []; l.research.hiringRoles.push({ role: '', count: '', source: '' }); }),
    'hiring-remove': (el) => PV.mutate(el.dataset.id, (l) => { l.research.hiringRoles.splice(Number(el.dataset.i), 1); }),
    'research-done': (el) => {
      const l = S.lead(el.dataset.id);
      if (!E.signalEntries(l).length) { U.toast('Add at least one observed signal first', 'err'); return; }
      if (['new', 'researching'].includes(l.status)) PV.setStatus(l.id, 'researchComplete', { silent: true });
      PV.mutate(l.id, (x) => { PV.stamp(x, 'researched'); });
      U.toast('Research marked complete');
    }
  });
})();
