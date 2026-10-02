/* Lead Finder: builds Google X-ray searches. It never scrapes or logs in anywhere.
   The intern runs the searches, reads results by hand and adds good prospects. */
(function () {
  'use strict';
  const PV = window.PV, E = PV.E, U = PV.U;
  const { html, icon } = U;

  const locStr = (l) => [l.city, l.state, l.country].filter(Boolean).join(', ') || l.custom || '';

  function fromIcp() {
    const icp = PV.settings.icp;
    return { industries: icp.industries.slice(0, 2), titles: icp.titles.slice(), locations: icp.locations.map((l) => l.city || l.state || l.country || l.custom).filter(Boolean),
      sizes: icp.sizes.slice(), keywords: (icp.keywords || []).join(', ') };
  }
  function state() {
    if (!PV.prefs.finder) PV.prefs.finder = fromIcp();
    return PV.prefs.finder;
  }

  function chips(key, options, selected, custom) {
    return html`<div class="chips">${options.map((o) => html`<button type="button" class="chip ${selected.includes(o) ? 'on' : ''}" data-action="finder-toggle" data-k="${key}" data-v="${o}">${o}</button>`)}
      ${custom ? html`<input class="input sm" style="width:160px" data-finder-add="${key}" placeholder="+ ${custom}" aria-label="${custom}">` : ''}</div>`;
  }

  PV.views.finder = {
    render() {
      const f = state();
      const icp = PV.settings.icp;
      const titleOpts = Array.from(new Set(E.TITLES.concat(icp.titles, f.titles)));
      const locOpts = Array.from(new Set(icp.locations.map((l) => l.city || l.state || l.country || l.custom).filter(Boolean).concat(f.locations)));
      const queries = E.buildQueries({ industries: f.industries, titles: f.titles, locations: f.locations, sizes: f.sizes, keywords: f.keywords.split(',').map((s) => s.trim()) });
      const used = (PV.prefs.usedQueries && PV.prefs.usedQueries.day === PV.today()) ? PV.prefs.usedQueries.list : [];
      const added = E.activity(PV.leads, PV.today()).added;
      const target = PV.target();
      const groups = ['People', 'Companies', 'Signals'];
      return html`
        <div class="page-head"><div><h1>Lead Finder</h1><p class="sub">Pick the ICP slice you want today and copy the searches into Google. Read the results yourself and add the prospects that genuinely fit.</p></div>
          <div class="actions"><button class="btn" data-action="finder-reset">Reset to ICP</button></div></div>
        <div class="grid g-main-wide">
          <div class="stack">
            <div class="card"><div class="card-b stack">
              <div class="field"><label>Industry</label>${chips('industries', E.INDUSTRIES.filter((i) => i !== 'Other'), f.industries)}<span class="help">Up to 3 are used to build searches.</span></div>
              <div class="field"><label>Location</label>${chips('locations', locOpts, f.locations, 'Add city / state / country')}<span class="help">Locations from your ICP. Type to add a custom one, then press Enter.</span></div>
              <div class="field"><label>Job title</label>${chips('titles', titleOpts, f.titles, 'Custom title')}</div>
              <div class="field"><label>Company size</label>${chips('sizes', E.SIZES, f.sizes)}<span class="help">Used on company-page searches (LinkedIn shows headcount like "51-200 employees").</span></div>
              <div class="field"><label for="fk">Keywords (optional)</label><input class="input" id="fk" data-finder-kw value="${f.keywords}" placeholder="e.g. automation, onboarding, RIA"><span class="help">Comma-separated. Each keyword must appear in the result.</span></div>
            </div></div>
            <div class="card">
              <div class="card-h"><h2>Search queries</h2><span class="sub">${queries.length} variations · ${used.length} used today</span></div>
              ${queries.length ? groups.map((g) => {
                const qs = queries.filter((q) => q.group === g);
                if (!qs.length) return '';
                return html`<div class="card-h" style="background:var(--surface-2)"><h3>${g === 'People' ? 'Find people (LinkedIn profiles)' : g === 'Companies' ? 'Find companies' : 'Find timing signals (for research)'}</h3></div>
                  ${qs.map((q) => html`<div class="query ${used.includes(q.query) ? 'used' : ''}"><div class="qtext"><div class="strong small">${q.label}${used.includes(q.query) ? html` <span class="badge b-line">used</span>` : ''}</div>${q.note ? html`<div class="tiny muted">${q.note}</div>` : ''}<code>${q.query}</code></div>
                    <div class="stack-sm"><button class="btn sm dark" data-action="copy-query" data-q="${q.query}">${icon('copy')}Copy Search Query</button><a class="btn sm" href="${q.url}" target="_blank" rel="noopener" data-action="open-query" data-q="${q.query}" data-url="${q.url}">${icon('ext')}Open in Google</a></div></div>`)}`;
              }) : html`<div class="empty"><h3>Pick at least one industry and one job title</h3></div>`}
            </div>
          </div>
          <div class="stack">
            <div class="card"><div class="card-h"><h2>Today</h2><div class="right"><span class="badge ${added >= target ? 'b-green' : 'b-dark'}">${added} / ${target} added</span></div></div>
              <div class="card-b"><div class="progress coral"><i style="width:${Math.min(100, Math.round(added * 100 / target))}%"></i></div>
              <button class="btn primary lg mt" style="width:100%" data-action="add-lead">${icon('plus')}Add a prospect you found</button>
              <p class="tiny muted mt-sm">Tip: paste the LinkedIn URL first. The name fills in, and duplicates are flagged before you save.</p></div></div>
            <div class="card"><div class="card-h"><h2>How to use the results</h2></div><div class="card-b small stack-sm">
              <div><b>1.</b> Open a search, scan titles and snippets in Google. Do not log in or use automation tools.</div>
              <div><b>2.</b> Open promising profiles yourself. Check role, company and location match the ICP.</div>
              <div><b>3.</b> Check the company has at least one recent, public signal worth mentioning. No signal, no outreach.</div>
              <div><b>4.</b> Add the prospect, then research. Quality over volume: ${target} good leads beat 50 weak ones.</div>
            </div></div>
            <div class="card"><div class="card-b tiny muted">This page only builds search strings. It does not scrape LinkedIn or Google, bypass logins, or automate any platform. All research is done by a person, by hand.</div></div>
          </div>
        </div>`;
    },
    mount(root) {
      root.querySelectorAll('[data-finder-add]').forEach((el) => el.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || !el.value.trim()) return;
        e.preventDefault();
        const f = state();
        const k = el.dataset.finderAdd;
        if (!f[k].includes(el.value.trim())) f[k].push(el.value.trim());
        PV.savePrefs(); PV.render();
        const again = document.querySelector(`[data-finder-add="${k}"]`); if (again) again.focus();
      }));
      const kw = root.querySelector('[data-finder-kw]');
      kw.addEventListener('change', () => { state().keywords = kw.value; PV.savePrefs(); PV.render(); });
    }
  };

  function markUsed(q) {
    const day = PV.today();
    if (!PV.prefs.usedQueries || PV.prefs.usedQueries.day !== day) PV.prefs.usedQueries = { day, list: [] };
    if (!PV.prefs.usedQueries.list.includes(q)) PV.prefs.usedQueries.list.push(q);
    PV.savePrefs();
  }

  Object.assign(PV.actions, {
    'finder-toggle': (el) => {
      const f = state();
      const list = f[el.dataset.k];
      const i = list.indexOf(el.dataset.v);
      if (i === -1) list.push(el.dataset.v); else list.splice(i, 1);
      PV.savePrefs(); PV.render();
    },
    'finder-reset': () => { PV.prefs.finder = fromIcp(); PV.savePrefs(); PV.render(); },
    'copy-query': (el) => { U.copy(el.dataset.q, 'Search query'); markUsed(el.dataset.q); setTimeout(PV.render, 300); },
    'open-query': (el) => { window.open(el.dataset.url, '_blank', 'noopener'); markUsed(el.dataset.q); PV.render(); }
  });
})();
