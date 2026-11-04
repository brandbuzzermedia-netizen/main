/* Settings: company profile, ICP builder, outreach rules, scoring weights,
   uploaded materials, and data management. */
(function () {
  'use strict';
  const PV = window.PV, E = PV.E, U = PV.U, S = PV.S;
  const { html, icon } = U;

  const TABS = [['company', 'Point Vision profile'], ['icp', 'Target customer (ICP)'], ['outreach', 'Outreach'], ['scoring', 'Lead scoring'], ['materials', 'Materials'], ['data', 'Data']];
  const KINDS = [['case-study', 'Case study'], ['testimonial', 'Testimonial'], ['service', 'Service information'], ['campaign', 'Past successful campaign'], ['client-result', 'Client result']];

  const lines = (path, val, rows, ph) => html`<textarea class="textarea" data-s="${path}" data-lines rows="${rows || 4}" placeholder="${ph || 'One per line'}">${(val || []).join('\n')}</textarea>`;

  function company(s) {
    const c = s.company;
    return html`<div class="card"><div class="card-h"><h2>Point Vision profile</h2><span class="sub">Used in every generated email. Keep it factual; nothing here is embellished</span></div><div class="card-b form">
      <div class="field"><label>Company name</label><input class="input" data-s="company.name" value="${c.name}"></div>
      <div class="field"><label>Website</label><input class="input" data-s="company.website" value="${c.website}"></div>
      <div class="field full"><label>Description</label><textarea class="textarea" data-s="company.description" rows="3">${c.description}</textarea></div>
      <div class="field"><label>Services</label>${lines('company.services', c.services, 9)}<span class="help">The generator matches each opportunity to one of these.</span></div>
      <div class="field"><label>Value propositions</label>${lines('company.valueProps', c.valueProps, 9)}<span class="help">Only claims you can stand behind.</span></div>
      <div class="field"><label>Sender name</label><input class="input" data-s="company.senderName" value="${c.senderName}" placeholder="e.g. Mehul"></div>
      <div class="field"><label>Sender role</label><input class="input" data-s="company.senderRole" value="${c.senderRole}"></div>
      <div class="field full"><label>Email signature (optional)</label><textarea class="textarea" data-s="company.signature" rows="3" placeholder="Leave blank to sign with name, role and company">${c.signature}</textarea></div>
    </div></div>`;
  }

  function icp(s) {
    const i = s.icp;
    const chip = (path, v, on) => html`<button type="button" class="chip ${on ? 'on' : ''}" data-action="icp-toggle" data-p="${path}" data-v="${v}">${v}</button>`;
    const allTitles = Array.from(new Set(E.TITLES.concat(i.titles)));
    return html`<div class="stack">
      <div class="card"><div class="card-h"><h2>Industries</h2></div><div class="card-b chips">${E.INDUSTRIES.map((v) => chip('industries', v, i.industries.includes(v)))}</div></div>
      <div class="card"><div class="card-h"><h2>Target job titles</h2></div><div class="card-b"><div class="chips">${allTitles.map((v) => chip('titles', v, i.titles.includes(v)))}</div>
        <div class="row mt"><input class="input" id="new-title" placeholder="Add a custom title, e.g. Chief Operating Officer" style="max-width:340px"><button class="btn" data-action="icp-add-title">Add title</button></div></div></div>
      <div class="card"><div class="card-h"><h2>Geography</h2><span class="sub">Country → State → City, or a custom location</span></div><div class="card-b">
        <div class="table-wrap"><table class="t plain"><thead><tr><th>Country</th><th>State / region</th><th>City</th><th>Custom</th><th></th></tr></thead><tbody>
        ${i.locations.map((l, n) => html`<tr>
          <td><input class="input sm" data-s="icp.locations.${n}.country" value="${l.country || ''}" placeholder="United States"></td>
          <td><input class="input sm" data-s="icp.locations.${n}.state" value="${l.state || ''}" placeholder="New York"></td>
          <td><input class="input sm" data-s="icp.locations.${n}.city" value="${l.city || ''}" placeholder="New York"></td>
          <td><input class="input sm" data-s="icp.locations.${n}.custom" value="${l.custom || ''}" placeholder="e.g. Tri-state area"></td>
          <td><button class="btn sm ghost" data-action="icp-loc-rm" data-i="${n}" aria-label="Remove location">×</button></td></tr>`)}
        </tbody></table></div><button class="btn sm mt" data-action="icp-loc-add">${icon('plus')}Add location</button>
        <p class="tiny muted mt-sm">Scoring gives full ICP location credit for a city match, partial credit for the state or country.</p></div></div>
      <div class="card"><div class="card-h"><h2>Company size</h2></div><div class="card-b chips">${E.SIZES.map((v) => chip('sizes', v, i.sizes.includes(v)))}</div></div>
      <div class="card"><div class="card-h"><h2>Default keywords</h2></div><div class="card-b"><input class="input" data-s-csv="icp.keywords" value="${(i.keywords || []).join(', ')}" placeholder="Comma-separated, used by Lead Finder"></div></div>
    </div>`;
  }

  function outreach(s) {
    const o = s.outreach;
    return html`<div class="card"><div class="card-h"><h2>Outreach rules</h2></div><div class="card-b form">
      <div class="field"><label>Daily prospect target</label><input class="input" type="number" min="1" max="100" data-s="outreach.dailyTarget" data-num value="${o.dailyTarget}"></div>
      <div class="field"><label>Email tone (default version)</label><select class="select" data-s="outreach.tone">${[['A', 'Direct: short and concise'], ['B', 'Insight-led: opens with an observation'], ['C', 'Founder-to-founder: conversational']].map(([v, t]) => PV.opt(v, o.tone, t))}</select></div>
      <div class="field"><label>CTA style</label><select class="select" data-s="outreach.ctaStyle">${Object.keys(E.CTA_STYLES).map((k) => PV.opt(k, o.ctaStyle, E.CTA_STYLES[k].label))}</select><span class="help">e.g. “${E.CTA_STYLES[o.ctaStyle] ? E.CTA_STYLES[o.ctaStyle].lines[0] : ''}”</span></div>
      <div class="field"><label>Follow-up schedule (days after first email)</label><input class="input" data-s-csv-num="outreach.followUpDays" value="${o.followUpDays.join(', ')}" placeholder="3, 7, 14"><span class="help">Three reminders: short reminder, insight, close the loop.</span></div>
      <div class="field"><label>Minimum words</label><input class="input" type="number" data-s="outreach.minWords" data-num value="${o.minWords}"></div>
      <div class="field"><label>Maximum words</label><input class="input" type="number" data-s="outreach.maxWords" data-num value="${o.maxWords}"></div>
      <div class="field full"><label>Phrases to avoid</label>${lines('outreach.avoidPhrases', o.avoidPhrases, 8)}<span class="help">Flagged in every draft. One per line.</span></div>
    </div></div>`;
  }

  function scoring(s) {
    const w = s.scoring;
    const total = Object.values(w).reduce((a, b) => a + (Number(b) || 0), 0);
    const rows = [['icp', 'ICP Fit', 'Industry and geography match the ICP'], ['decision', 'Decision Maker Fit', 'Seniority and relevance of the role'], ['opportunity', 'Opportunity Signal', 'Evidence of a technology, automation or operational opportunity'],
      ['company', 'Company Fit', 'Company size and known business characteristics'], ['personalization', 'Personalization Data', 'How much meaningful research is available'], ['timing', 'Timing Signal', 'Recent hiring, launch, expansion, funding or transformation']];
    return html`<div class="card"><div class="card-h"><h2>Lead scoring criteria</h2><span class="sub">Weights are normalised to 100 · internal prioritisation only</span><div class="right"><button class="btn sm" data-action="reset-scoring">Reset to default</button></div></div>
      <div class="card-b"><div class="table-wrap"><table class="t plain"><thead><tr><th>Criterion</th><th>What it measures</th><th class="num">Points</th></tr></thead><tbody>
      ${rows.map(([k, t, d]) => html`<tr><td class="strong nowrap">${t}</td><td class="muted">${d}</td><td class="num"><input class="input sm" style="width:80px;text-align:right" type="number" min="0" max="100" data-s="scoring.${k}" data-num data-rerender value="${w[k]}"></td></tr>`)}
      <tr><td class="strong">Total</td><td></td><td class="num strong">${total}</td></tr></tbody></table></div>
      <div class="row wrap mt"><span class="badge b-green">80–100 High Priority</span><span class="badge b-amber">60–79 Medium Priority</span><span class="badge">Below 60 Low Priority</span></div></div></div>`;
  }

  function materials(s) {
    const m = s.materials || [];
    return html`<div class="stack">
      <div class="card"><div class="card-h"><h2>Add material</h2><span class="sub">Case studies, testimonials, service info, past campaigns, client results</span></div>
        <form class="card-b form" id="mat-form">
          <div class="field"><label>Type</label><select class="select" name="kind">${KINDS.map(([v, t]) => PV.opt(v, 'case-study', t))}</select></div>
          <div class="field"><label>Industry (optional)</label><select class="select" name="industry"><option value="">Any</option>${E.INDUSTRIES.map((i) => PV.opt(i, ''))}</select></div>
          <div class="field full"><label>Title</label><input class="input" name="title" placeholder="e.g. Client onboarding automation for a wealth manager" required></div>
          <div class="field full"><label>Content</label><textarea class="textarea" name="content" rows="5" placeholder="Paste the text, or upload a .txt / .md / .csv file below."></textarea></div>
          <div class="field full"><label>Or upload a text file</label><input type="file" name="file" accept=".txt,.md,.csv,.json,text/plain"></div>
          <div class="full row"><button class="btn dark" type="submit">${icon('upload')}Save material</button><span class="tiny muted">Emails mention a case study or result only if one exists here for the same industry, by title. Nothing is invented.</span></div>
        </form></div>
      <div class="card"><div class="card-h"><h2>Library</h2><span class="sub">${m.length} item${m.length === 1 ? '' : 's'}</span></div>
        ${m.length ? html`<div class="list">${m.map((x, i) => html`<div class="li" style="align-items:flex-start"><div class="grow"><div class="row wrap"><span class="ttl">${x.title}</span><span class="badge">${(KINDS.find((k) => k[0] === x.kind) || [, x.kind])[1]}</span>${x.industry ? html`<span class="badge b-line">${x.industry}</span>` : ''}</div>
          <div class="small muted mt-sm" style="white-space:pre-wrap">${(x.content || '').slice(0, 400)}${(x.content || '').length > 400 ? '…' : ''}</div></div><button class="btn sm ghost danger" data-action="mat-rm" data-i="${i}">Remove</button></div>`)}</div>`
          : html`<div class="empty"><h3>No materials yet</h3><p>Until you add real case studies or results, outreach will not reference any.</p></div>`}
      </div></div>`;
  }

  function data() {
    const n = PV.leads.length;
    const samples = PV.leads.filter((l) => l.sample).length;
    return html`<div class="stack">
      <div class="card"><div class="card-h"><h2>Storage</h2></div><div class="card-b small stack-sm">
        ${S.mode === 'server' ? html`<p><span class="badge b-green">Shared workspace</span> Data is synced to the team server and cached in this browser.</p>`
          : html`<p><span class="badge">This browser only</span> Data is saved in this browser's local storage. To share one workspace between the intern and the founder, run <span class="mono">node server.js</span> and open the address it prints. See the README.</p>`}
        <p class="muted">${n} leads stored${samples ? `, ${samples} of them sample data` : ''}.</p></div></div>
      <div class="card"><div class="card-h"><h2>Backup</h2></div><div class="card-b btn-row">
        <button class="btn" data-action="backup">${icon('download')}Download backup (JSON)</button>
        <label class="btn">${icon('upload')}Restore from backup<input type="file" accept=".json,application/json" id="restore" hidden></label>
      </div></div>
      <div class="card"><div class="card-h"><h2>Sample data</h2></div><div class="card-b btn-row">
        <button class="btn danger" data-action="clear-sample" ${samples ? '' : 'disabled'}>Remove ${samples} sample lead${samples === 1 ? '' : 's'}</button>
        <button class="btn" data-action="load-sample">Reload sample leads</button>
      </div></div>
      <div class="card"><div class="card-h"><h2>Reset</h2></div><div class="card-b btn-row">
        <button class="btn danger" data-action="reset-all">Delete all leads and reset settings</button>
      </div></div></div>`;
  }

  PV.views.settings = {
    render(r) {
      const tab = r.id || 'company';
      const s = PV.settings;
      const body = { company, icp, outreach, scoring, materials, data }[tab] || company;
      return html`<div class="page-head"><div><h1>Settings</h1><p class="sub">Changes save automatically${S.mode === 'server' ? ' and sync to the team' : ''}.</p></div></div>
        <nav class="tabs">${TABS.map(([k, t]) => html`<a href="#/settings/${k}" class="${tab === k ? 'on' : ''}">${t}</a>`)}</nav>
        <div style="max-width:980px">${body(s)}</div>`;
    },
    mount(root) {
      root.querySelectorAll('[data-s-csv], [data-s-csv-num]').forEach((el) => el.addEventListener('change', () => {
        const isNum = el.dataset.sCsvNum !== undefined;
        const path = el.dataset.sCsv || el.dataset.sCsvNum;
        let v = el.value.split(',').map((x) => x.trim()).filter(Boolean);
        if (isNum) v = v.map(Number).filter((x) => x > 0).slice(0, 3);
        PV.setPath(S.settings, path, v);
        S.saveSettings({ silent: true });
        U.toast('Saved');
      }));
      const mf = root.querySelector('#mat-form');
      if (mf) mf.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(mf);
        let content = String(fd.get('content') || '').trim();
        const file = fd.get('file');
        if (file && file.size) {
          if (file.size > 400000) { U.toast('File is too large (max 400 KB of text)', 'err'); return; }
          content = (content ? content + '\n\n' : '') + (await file.text()).trim();
        }
        const title = String(fd.get('title') || '').trim() || (file && file.name) || '';
        if (!title) { U.toast('Add a title', 'err'); return; }
        S.settings.materials.push({ id: E.uid(), kind: fd.get('kind'), industry: fd.get('industry'), title, content, addedAt: new Date().toISOString() });
        S.saveSettings();
        U.toast('Material saved');
      });
      const rs = root.querySelector('#restore');
      if (rs) rs.addEventListener('change', async () => {
        const f = rs.files[0];
        if (!f) return;
        try {
          const d = JSON.parse(await f.text());
          if (!Array.isArray(d.leads)) throw new Error('No leads array');
          U.confirmBox('Restore backup?', `This replaces current data with ${d.leads.length} leads from ${f.name}.`, 'Restore', () => { S.replaceAll(d); U.toast('Backup restored'); }, true);
        } catch (e) { U.toast('That file is not a valid backup', 'err'); }
      });
    }
  };

  Object.assign(PV.actions, {
    'icp-toggle': (el) => {
      const list = S.settings.icp[el.dataset.p];
      const i = list.indexOf(el.dataset.v);
      if (i === -1) list.push(el.dataset.v); else list.splice(i, 1);
      S.saveSettings();
    },
    'icp-add-title': () => {
      const v = document.getElementById('new-title').value.trim();
      if (!v) return;
      if (!S.settings.icp.titles.includes(v)) S.settings.icp.titles.push(v);
      S.saveSettings();
    },
    'icp-loc-add': () => { S.settings.icp.locations.push({ country: '', state: '', city: '', custom: '' }); S.saveSettings(); },
    'icp-loc-rm': (el) => { S.settings.icp.locations.splice(Number(el.dataset.i), 1); S.saveSettings(); },
    'reset-scoring': () => { S.settings.scoring = Object.assign({}, E.DEFAULT_SETTINGS.scoring); S.saveSettings(); },
    'mat-rm': (el) => { S.settings.materials.splice(Number(el.dataset.i), 1); S.saveSettings(); },
    'backup': () => U.download(`point-vision-lead-engine-backup-${PV.today()}.json`, JSON.stringify({ app: 'pv-lead-engine', exportedAt: new Date().toISOString(), settings: S.settings, leads: S.leads }, null, 2), 'application/json'),
    'clear-sample': () => U.confirmBox('Remove sample leads?', 'All leads marked as sample data are deleted. Your own leads are kept.', 'Remove', () => {
      S.replaceAll({ settings: S.settings, leads: S.leads.filter((l) => !l.sample) }); U.toast('Sample leads removed');
    }, true),
    'load-sample': () => {
      const ids = new Set(S.leads.map((l) => l.company + l.firstName));
      const fresh = window.PVSeed.build(E, S.settings, new Date()).filter((l) => !ids.has(l.company + l.firstName));
      S.replaceAll({ settings: S.settings, leads: fresh.concat(S.leads) });
      U.toast(`${fresh.length} sample leads loaded`);
    },
    'reset-all': () => U.confirmBox('Delete everything?', 'All leads, research and drafts are deleted and settings return to defaults. Download a backup first if you might need it.', 'Delete everything', () => {
      S.replaceAll({ settings: JSON.parse(JSON.stringify(E.DEFAULT_SETTINGS)), leads: [] }); U.toast('Workspace reset');
    }, true)
  });
})();
