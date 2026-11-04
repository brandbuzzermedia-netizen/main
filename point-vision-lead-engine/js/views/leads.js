/* Lead database, lead form (add / edit with duplicate detection) and the
   lead detail page with outbound tracking, LinkedIn steps and follow-ups. */
(function () {
  'use strict';
  const PV = window.PV, E = PV.E, U = PV.U, S = PV.S;
  const { html, raw, icon } = U;

  const opt = (v, cur, label) => html`<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${label || v}</option>`;
  PV.opt = opt;

  PV.mailtoHref = (l, subject, body) => 'mailto:' + encodeURIComponent(l.email || '').replace(/%40/g, '@') + '?subject=' + encodeURIComponent(subject || '') + '&body=' + encodeURIComponent(body || '');
  PV.mailtoBtn = (l, subject, body, label) => {
    const o = l.outreach || {};
    return html`<a class="btn sm" href="${PV.mailtoHref(l, subject || o.subject, body || o.body)}" title="Opens a draft in your own mail app. Nothing is sent automatically.">${icon('mail')}${label || 'Open in mail app'}</a>`;
  };

  /* ---------------- Lead form ---------------- */

  function formHtml(lead, isNew) {
    const l = lead;
    const sc = PV.score(l);
    return html`<form id="lead-form" autocomplete="off">
      <div class="mh"><h2>${isNew ? 'Add lead' : 'Edit lead'}</h2><button type="button" class="x-btn" data-action="close-modal" aria-label="Close">×</button></div>
      <div class="mb">
        <div id="dupe-box"></div>
        <div class="form">
          <div class="field full"><label for="f-linkedin" class="req">LinkedIn URL</label><input class="input" id="f-linkedin" name="linkedin" value="${l.linkedin}" placeholder="https://www.linkedin.com/in/…" autofocus><span class="help">Paste it first: the name fills in from the URL if it can.</span></div>
          <div class="field"><label for="f-first" class="req">First name</label><input class="input" id="f-first" name="firstName" value="${l.firstName}"></div>
          <div class="field"><label for="f-last" class="req">Last name</label><input class="input" id="f-last" name="lastName" value="${l.lastName}"></div>
          <div class="field"><label for="f-title" class="req">Job title</label><input class="input" id="f-title" name="title" value="${l.title}" list="dl-titles"></div>
          <div class="field"><label for="f-company" class="req">Company</label><input class="input" id="f-company" name="company" value="${l.company}"></div>
          <div class="field"><label for="f-web">Company website</label><input class="input" id="f-web" name="website" value="${l.website}" placeholder="https://"></div>
          <div class="field"><label for="f-loc" class="req">Location</label><input class="input" id="f-loc" name="location" value="${l.location}" placeholder="New York, NY, United States" list="dl-locs"></div>
          <div class="field"><label for="f-ind" class="req">Industry</label><select class="select" id="f-ind" name="industry"><option value="">Select…</option>${E.INDUSTRIES.map((i) => opt(i, l.industry))}</select></div>
          <div class="field"><label for="f-size">Company size</label><select class="select" id="f-size" name="companySize"><option value="">Select…</option>${E.SIZES.map((s) => opt(s, l.companySize, s + ' employees'))}</select></div>
          <div class="field"><label for="f-email">Email</label><input class="input" id="f-email" name="email" type="email" value="${l.email}"></div>
          <div class="field"><label for="f-esrc">Email source</label><input class="input" id="f-esrc" name="emailSource" value="${l.emailSource}" list="dl-esrc" placeholder="Where did it come from?"></div>
          <div class="field"><label for="f-estat">Email verification status</label><select class="select" id="f-estat" name="emailStatus">${E.EMAIL_STATUSES.map((s) => opt(s, l.emailStatus))}</select></div>
          <div class="field"><label for="f-status">Lead status</label><select class="select" id="f-status" name="status">${E.STAGES.map((s) => opt(s.key, l.status, s.label))}</select></div>
          <div class="field full"><label for="f-notes">Research notes</label><textarea class="textarea" id="f-notes" name="notes" placeholder="Anything worth remembering. Detailed research goes in the Research workspace.">${l.notes}</textarea></div>
          <div class="field"><label>Lead score</label><div class="row">${U.scoreBadge(sc)}<span class="small muted">Calculated ${sc.calculated} / 100 from ICP fit and research</span></div></div>
          <div class="field"><label for="f-override">Manual score (optional)</label><input class="input" id="f-override" name="scoreOverride" type="number" min="0" max="100" value="${l.scoreOverride == null ? '' : l.scoreOverride}" placeholder="Leave blank to use calculated"></div>
        </div>
        <datalist id="dl-titles">${E.TITLES.concat(PV.settings.icp.titles).filter((v, i, a) => a.indexOf(v) === i).map((t) => html`<option value="${t}">`)}</datalist>
        <datalist id="dl-esrc">${E.EMAIL_SOURCES.map((t) => html`<option value="${t}">`)}</datalist>
        <datalist id="dl-locs">${PV.settings.icp.locations.map((x) => html`<option value="${[x.city, x.state, x.country].filter(Boolean).join(', ')}">`)}</datalist>
      </div>
      <div class="mf">
        ${isNew ? '' : html`<button type="button" class="btn danger" data-action="delete-lead" data-id="${l.id}" style="margin-right:auto">${icon('trash')}Delete</button>`}
        <button type="button" class="btn" data-action="close-modal">Cancel</button>
        ${isNew ? html`<button type="submit" class="btn" data-next="another">Save &amp; add another</button>` : ''}
        <button type="submit" class="btn dark" data-next="research">${isNew ? 'Save &amp; research' : 'Save'}</button>
      </div>
    </form>`;
  }

  function nameFromLinkedIn(url) {
    const slug = E.normLinkedIn(url);
    if (!slug || slug.includes('.') || slug.includes('/')) return null;
    const parts = decodeURIComponent(slug).split('-').filter((p) => /^[a-z]+$/i.test(p) && p.length > 1);
    if (parts.length < 2) return null;
    const cap = (s) => s[0].toUpperCase() + s.slice(1).toLowerCase();
    return { first: cap(parts[0]), last: cap(parts[parts.length - 1]) };
  }

  function readForm(form) {
    const d = {};
    new FormData(form).forEach((v, k) => { d[k] = typeof v === 'string' ? v.trim() : v; });
    d.scoreOverride = d.scoreOverride === '' ? null : Number(d.scoreOverride);
    return d;
  }

  PV.openLeadForm = (id) => {
    const existing = id ? S.lead(id) : null;
    const draft = existing ? JSON.parse(JSON.stringify(existing)) : E.newLead({ location: '', industry: (PV.settings.icp.industries || [])[0] || '' });
    if (!existing) draft.industry = '';
    const ov = U.modal(formHtml(draft, !existing));
    const form = ov.querySelector('#lead-form');
    let submitter = 'research';
    let autoName = null;
    const checkDupes = () => {
      const d = Object.assign({ id: draft.id }, readForm(form));
      const dupes = E.findDuplicates(d, PV.leads);
      const box = form.querySelector('#dupe-box');
      box.innerHTML = dupes.length ? U.toStr(html`<div class="dupe mb"><b>Possible duplicate.</b> ${dupes.map((x) => html`<div><a href="#/lead/${x.lead.id}" data-action="close-modal-go" data-href="#/lead/${x.lead.id}">${PV.leadName(x.lead)} · ${x.lead.company}</a> matches on ${x.reasons.join(', ')} (${U.statusBadge(x.lead.status)})</div>`)}<div class="tiny" style="margin-top:4px">You can still save if this is genuinely a different person.</div></div>`) : '';
      return dupes;
    };
    form.addEventListener('input', (e) => {
      if (e.target.name === 'linkedin') {
        const n = nameFromLinkedIn(e.target.value);
        const untouched = (!form.firstName.value && !form.lastName.value) || (autoName && form.firstName.value === autoName.first && form.lastName.value === autoName.last);
        if (n && untouched) { form.firstName.value = n.first; form.lastName.value = n.last; autoName = n; }
      }
      checkDupes();
    });
    form.querySelectorAll('[type=submit]').forEach((b) => b.addEventListener('click', () => { submitter = b.dataset.next; }));
    checkDupes();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const d = readForm(form);
      if (!d.firstName && !d.lastName && !d.company) { U.toast('Add at least a name or company', 'err'); return; }
      const lead = existing || draft;
      const prevStatus = lead.status;
      const prevEmailStatus = lead.emailStatus;
      Object.assign(lead, d);
      lead.status = prevStatus;
      if (d.emailStatus !== 'Unverified' && d.emailStatus !== prevEmailStatus) PV.stamp(lead, 'verified');
      S.saveLead(lead, { silent: true });
      if (d.status !== prevStatus) PV.setStatus(lead.id, d.status, { silent: true });
      U.closeModal();
      U.toast(existing ? 'Lead saved' : 'Lead added');
      if (!existing && submitter === 'another') { PV.render(); PV.openLeadForm(); return; }
      if (!existing && submitter === 'research') { PV.go('#/research/' + lead.id); return; }
      PV.render();
    });
  };

  Object.assign(PV.actions, {
    'add-lead': () => PV.openLeadForm(),
    'edit-lead': (el) => PV.openLeadForm(el.dataset.id),
    'close-modal-go': (el) => { U.closeModal(); PV.go(el.dataset.href); },
    'delete-lead': (el) => {
      const l = S.lead(el.dataset.id);
      U.confirmBox('Delete lead?', `${PV.leadName(l)} at ${l.company} and all research and drafts will be removed.`, 'Delete', () => {
        S.deleteLead(l.id); U.closeModal(); U.toast('Lead deleted'); PV.go('#/leads');
      }, true);
    }
  });

  /* ---------------- Lead database ---------------- */

  const DEFAULT_FILTERS = { q: '', industry: '', location: '', title: '', score: '', status: '', emailStatus: '', added: '', followup: '' };
  const COLS = [
    ['name', 'Name'], ['company', 'Company'], ['title', 'Role'], ['industry', 'Industry'], ['location', 'Location'], ['score', 'Lead Score'],
    ['status', 'Status'], ['emailStatus', 'Email Status'], ['research', 'Research Status'], ['sent', 'Email Sent'], ['linkedin', 'LinkedIn Status'],
    ['activity', 'Last Activity'], ['next', 'Next Follow-up']
  ];

  function rows() {
    const today = PV.today();
    return PV.leads.map((l) => {
      const sc = PV.score(l);
      const fu = E.nextFollowUp(l, PV.settings);
      return { l, sc, fu, name: PV.leadName(l), research: E.researchStatus(l), li: E.linkedinStatus(l),
        last: (l.activity && l.activity.length ? l.activity[l.activity.length - 1].at : l.updatedAt), due: fu ? fu.due : '', overdue: fu && fu.due <= today };
    });
  }

  function applyFilters(list, f) {
    const today = PV.today();
    const q = f.q.toLowerCase();
    return list.filter((r) => {
      const l = r.l;
      if (q && ![r.name, l.company, l.title, l.email, l.location, l.industry].join(' ').toLowerCase().includes(q)) return false;
      if (f.industry && l.industry !== f.industry) return false;
      if (f.location && !(l.location || '').toLowerCase().includes(f.location.toLowerCase())) return false;
      if (f.title && !(l.title || '').toLowerCase().includes(f.title.toLowerCase())) return false;
      if (f.score && r.sc.priority.key !== f.score) return false;
      if (f.status && l.status !== f.status) return false;
      if (f.emailStatus && (l.emailStatus || 'Unverified') !== f.emailStatus) return false;
      if (f.added) {
        const k = E.dayKey(l.milestones.added || l.createdAt);
        if (f.added === 'today' && k !== today) return false;
        if (f.added === '7' && k < E.dayKey(E.addDays(new Date(), -6))) return false;
        if (f.added === '30' && k < E.dayKey(E.addDays(new Date(), -29))) return false;
      }
      if (f.followup === 'due' && !r.overdue) return false;
      if (f.followup === 'upcoming' && !(r.fu && !r.overdue)) return false;
      if (f.followup === 'none' && r.fu) return false;
      return true;
    });
  }

  function sortRows(list, key, dir) {
    const val = (r) => ({ name: r.name, company: r.l.company, title: r.l.title, industry: r.l.industry, location: r.l.location, score: r.sc.total,
      status: E.STAGE_BY_KEY[r.l.status].index, emailStatus: r.l.emailStatus, research: r.research, sent: r.l.milestones.sent || '', linkedin: r.li,
      activity: r.last || '', next: r.due || '9999' }[key]);
    return list.slice().sort((a, b) => {
      const x = val(a), y = val(b);
      const c = typeof x === 'number' ? x - y : String(x || '').localeCompare(String(y || ''));
      return dir === 'desc' ? -c : c;
    });
  }

  PV.views.leads = {
    render(r) {
      const f = Object.assign({}, DEFAULT_FILTERS, PV.prefs.leadFilters || {}, r.params || {});
      const sort = PV.prefs.leadSort || { key: 'activity', dir: 'desc' };
      const all = rows();
      const list = sortRows(applyFilters(all, f), sort.key, sort.dir);
      PV._leadList = list;
      const distinct = (fn) => Array.from(new Set(PV.leads.map(fn).filter(Boolean))).sort();
      const cities = distinct((l) => (l.location || '').split(',')[0].trim());
      const sel = (key, label, options) => html`<select class="select sm" data-filter="${key}" aria-label="${label}"><option value="">${label}</option>${options.map(([v, t]) => opt(v, f[key], t))}</select>`;
      const active = Object.keys(DEFAULT_FILTERS).some((k) => f[k]);
      return html`
        <div class="page-head"><div><h1>Leads</h1><p class="sub">${PV.leads.length} leads in the database. Click a row to open it.</p></div>
          <div class="actions"><button class="btn" data-action="export-csv">${icon('download')}Export CSV</button><button class="btn primary" data-action="add-lead">${icon('plus')}Add lead</button></div></div>
        <div class="card">
          <div class="filters">
            <div class="search" style="flex:1;min-width:200px">${icon('search')}<input class="input sm" data-filter="q" placeholder="Search name, company, email…" value="${f.q}" aria-label="Search leads"></div>
            ${sel('industry', 'Industry', distinct((l) => l.industry).map((v) => [v, v]))}
            ${sel('location', 'Location', cities.map((v) => [v, v]))}
            <input class="input sm" data-filter="title" placeholder="Job title" value="${f.title}" style="width:130px" aria-label="Job title">
            ${sel('score', 'Lead score', [['high', 'High (80+)'], ['medium', 'Medium (60–79)'], ['low', 'Low (<60)']])}
            ${sel('status', 'Status', E.STAGES.map((s) => [s.key, s.label]))}
            ${sel('emailStatus', 'Email status', E.EMAIL_STATUSES.map((s) => [s, s]))}
            ${sel('added', 'Date added', [['today', 'Today'], ['7', 'Last 7 days'], ['30', 'Last 30 days']])}
            ${sel('followup', 'Follow-up', [['due', 'Due / overdue'], ['upcoming', 'Upcoming'], ['none', 'None scheduled']])}
            ${active ? html`<button class="btn sm ghost" data-action="clear-filters">Clear</button>` : ''}
          </div>
          <div class="table-wrap"><table class="t compact"><thead><tr>${COLS.map(([k, t]) => html`<th class="sortable" data-action="sort" data-key="${k}">${t}${sort.key === k ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}</th>`)}</tr></thead>
          <tbody>${list.map((x) => html`<tr data-href="#/lead/${x.l.id}">
            <td class="nowrap"><b>${x.name}</b></td><td>${x.l.company}</td><td>${x.l.title}</td><td class="nowrap">${x.l.industry}</td><td class="nowrap">${x.l.location}</td>
            <td>${U.scoreBadge(x.sc)}</td><td>${U.statusBadge(x.l.status)}</td><td>${U.emailBadge(x.l.emailStatus)}</td>
            <td><span class="badge ${x.research === 'Complete' ? 'b-green' : x.research === 'In progress' ? 'b-blue' : ''}">${x.research}</span></td>
            <td class="nowrap">${x.l.milestones.sent ? U.shortDate(x.l.milestones.sent) : html`<span class="faint">—</span>`}</td>
            <td class="nowrap">${x.li}</td><td class="nowrap muted">${U.ago(x.last)}</td>
            <td class="nowrap">${x.fu ? html`<span class="badge ${x.overdue ? 'b-coral' : ''}">${U.dueLabel(x.fu.due)}</span>` : html`<span class="faint">—</span>`}</td>
          </tr>`)}</tbody></table></div>
          ${list.length ? '' : html`<div class="empty"><h3>No leads match</h3><p>Try clearing a filter.</p></div>`}
        </div>`;
    },
    mount(root) {
      root.querySelectorAll('[data-filter]').forEach((el) => {
        const ev = el.tagName === 'INPUT' ? 'input' : 'change';
        el.addEventListener(ev, () => {
          PV.prefs.leadFilters = Object.assign({}, PV.prefs.leadFilters, { [el.dataset.filter]: el.value });
          PV.savePrefs();
          clearTimeout(PV._ft);
          PV._ft = setTimeout(() => {
            const pos = el.selectionStart;
            if (location.hash.includes('?')) { history.replaceState(null, '', '#/leads'); }
            PV.render();
            const again = document.querySelector(`[data-filter="${el.dataset.filter}"]`);
            if (again && el.tagName === 'INPUT') { again.focus(); try { again.setSelectionRange(pos, pos); } catch (e) { /* ignore */ } }
          }, el.tagName === 'INPUT' ? 180 : 0);
        });
      });
    }
  };

  Object.assign(PV.actions, {
    'sort': (el) => {
      const cur = PV.prefs.leadSort || {};
      PV.prefs.leadSort = { key: el.dataset.key, dir: cur.key === el.dataset.key && cur.dir === 'desc' ? 'asc' : 'desc' };
      PV.savePrefs(); PV.render();
    },
    'clear-filters': () => { PV.prefs.leadFilters = {}; PV.savePrefs(); history.replaceState(null, '', '#/leads'); PV.render(); },
    'export-csv': () => {
      const list = PV._leadList || rows();
      const head = ['First Name', 'Last Name', 'Job Title', 'Company', 'Company Website', 'LinkedIn URL', 'Location', 'Industry', 'Company Size', 'Email', 'Email Source', 'Email Verification Status', 'Lead Score', 'Priority', 'Status', 'Research Status', 'Email Sent', 'LinkedIn Status', 'Next Follow-up', 'Research Notes'];
      const data = list.map((x) => [x.l.firstName, x.l.lastName, x.l.title, x.l.company, x.l.website, x.l.linkedin, x.l.location, x.l.industry, x.l.companySize, x.l.email, x.l.emailSource, x.l.emailStatus, x.sc.total, x.sc.priority.label, E.STAGE_BY_KEY[x.l.status].label, x.research, x.l.milestones.sent ? E.dayKey(x.l.milestones.sent) : '', x.li, x.due, x.l.notes]);
      U.download(`point-vision-leads-${PV.today()}.csv`, E.toCSV([head].concat(data)), 'text/csv');
    }
  });

  /* ---------------- Lead detail ---------------- */

  const CHECKS = [
    ['emailSent', 'Email sent'], ['profileReviewed', 'LinkedIn profile reviewed'], ['requestSent', 'Connection request sent'],
    ['connected', 'Connected'], ['replied', 'Replied'], ['followupRequired', 'Follow-up required']
  ];

  function copyBlock(id, text, label) {
    return html`<div class="copybox" id="${id}">${text}</div><div class="row"><button class="btn sm" data-action="copy" data-from="#${id}" data-label="${label || 'Message'}">${icon('copy')}Copy</button></div>`;
  }
  PV.copyBlock = copyBlock;

  function outboundCard(l) {
    const st = E.STAGE_BY_KEY[l.status].index;
    const approvedIdx = E.STAGE_BY_KEY.approved.index;
    if (st < approvedIdx) {
      const step = E.nextStep(l);
      return html`<div class="card"><div class="card-h"><h2>Outbound</h2></div><div class="card-b"><p class="muted">Not approved yet. Nothing is sent from here until a founder approves it.</p>
        <p class="mt-sm"><span class="strong">Next step:</span> ${step.label}</p></div></div>`;
    }
    const o = l.outreach || {};
    if (l.status === 'approved') {
      return html`<div class="card"><div class="card-h"><h2>Ready to send</h2><span class="badge b-green">Approved</span></div>
        <div class="card-b stack-sm"><div class="small muted">To: ${l.email || 'no email on file'} · Subject: <b>${o.subject || ''}</b></div>
        ${copyBlock('send-body', o.body || '', 'Email')}
        <p class="tiny muted">Send it yourself from your inbox, then click Email Sent. Follow-up reminders start from that moment.</p>
        <div class="btn-row">${PV.mailtoBtn(l)}<button class="btn dark" data-action="mark-sent" data-id="${l.id}">${icon('send')}Email Sent</button></div></div></div>`;
    }
    const c = l.linkedinChecklist || {};
    const done = CHECKS.filter(([k]) => c[k]).length;
    return html`<div class="card"><div class="card-h"><h2>LinkedIn Follow-up</h2><span class="sub">Manual only. Nothing is automated on LinkedIn</span>
        <div class="right">${l.linkedin ? html`<a class="btn sm dark" href="${l.linkedin}" target="_blank" rel="noopener">${icon('linkedin')}Open LinkedIn</a>` : ''}</div></div>
      <div class="card-b">
        <div class="checklist-progress mb"><div class="progress green" style="flex:1"><i style="width:${Math.round(done * 100 / CHECKS.length)}%"></i></div><span class="small strong">${done} / ${CHECKS.length}</span></div>
        ${CHECKS.map(([k, t]) => html`<label class="check ${c[k] ? 'done' : ''}"><input type="checkbox" data-action="li-check" data-id="${l.id}" data-key="${k}" ${c[k] ? 'checked' : ''}><span class="t">${t}</span>
          ${k === 'emailSent' && l.milestones.sent ? html`<span class="tiny muted" style="margin-left:auto">${U.shortDate(l.milestones.sent)}</span>` : ''}</label>`)}
      </div></div>`;
  }

  function responseCard(l) {
    if (!l.milestones.sent) return '';
    const btn = (to, label, cls) => html`<button class="btn sm ${l.status === to ? 'dark' : cls || ''}" data-action="status" data-id="${l.id}" data-to="${to}">${label}</button>`;
    return html`<div class="card"><div class="card-h"><h2>Track response</h2><span class="sub">Log what happened. This feeds the analytics</span></div>
      <div class="card-b btn-row">${btn('replied', 'Replied')}${btn('positive', 'Positive reply')}${btn('meeting', 'Meeting booked')}${btn('qualified', 'Qualified')}${btn('proposal', 'Proposal')}${btn('won', 'Won')}${btn('notInterested', 'Not interested', 'danger')}${btn('lost', 'Lost', 'danger')}</div></div>`;
  }

  function linkedinCard(l) {
    const p = E.linkedinPlan(l, PV.settings);
    const connected = (l.linkedinChecklist || {}).connected;
    return html`<div class="card"><div class="card-h"><h2>LinkedIn strategy</h2></div><div class="card-b stack-sm">
      <div class="small"><span class="strong">Recommended:</span> ${p.recommended}</div>
      <div class="lbl-sm mt-sm">Optional connection note</div>${copyBlock('li-note', p.note, 'Connection note')}
      <details class="more" ${connected ? 'open' : ''}><summary>After they accept${connected ? '' : ' (use once connected)'}</summary>
        <div class="stack-sm mt-sm">
          <div class="lbl-sm">1 · First follow-up</div>${copyBlock('li-1', p.afterAccept.firstFollowUp)}
          <div class="lbl-sm">2 · Conversation starter</div>${copyBlock('li-2', p.afterAccept.conversationStarter)}
          <div class="lbl-sm">3 · Value-led follow-up</div>${copyBlock('li-3', p.afterAccept.valueFollowUp)}
          <p class="tiny muted">Hold off on pitching Point Vision until they show interest.</p>
        </div></details>
    </div></div>`;
  }

  function followupCard(l) {
    if (!l.milestones.sent) return '';
    const plan = E.followUpPlan(l, PV.settings);
    const stopped = E.STOP_FOLLOWUPS.includes(l.status) || l.milestones.replied;
    const today = PV.today();
    return html`<div class="card"><div class="card-h"><h2>Follow-ups</h2><span class="sub">${stopped ? 'Stopped: they responded or the lead is closed' : 'Reminders only. Send each one yourself'}</span></div>
      <div class="list">${plan.map((f) => html`<div class="li" style="align-items:flex-start"><div class="grow">
        <div class="row wrap"><span class="ttl">Follow-up ${f.n} · Day ${f.day}</span><span class="small muted">${f.label}</span>
          <span style="margin-left:auto">${f.doneAt ? html`<span class="badge b-green">Sent ${U.shortDate(f.doneAt)}</span>` : f.skipped ? html`<span class="badge">Skipped</span>` : stopped ? '' : html`<span class="badge ${f.due <= today ? 'b-coral' : ''}">${U.dueLabel(f.due)} · ${U.shortDate(f.due)}</span>`}</span></div>
        ${f.doneAt || f.skipped || stopped ? '' : html`<div class="mt-sm">${copyBlock('fu-' + f.n, f.body, 'Follow-up')}<div class="btn-row mt-sm">${PV.mailtoBtn(l, f.subject, f.body)}<button class="btn sm dark" data-action="fu-done" data-id="${l.id}" data-n="${f.n}">${icon('check')}Mark sent</button><button class="btn sm ghost" data-action="fu-skip" data-id="${l.id}" data-n="${f.n}">Skip</button></div></div>`}
      </div></div>`)}</div></div>`;
  }

  PV.followupCard = followupCard;

  PV.views.lead = {
    render(r) {
      const l = S.lead(r.id);
      if (!l) return html`<div class="card"><div class="empty"><h3>Lead not found</h3><p><a href="#/leads">Back to leads</a></p></div></div>`;
      const sc = PV.score(l);
      const opps = E.analyze(l, PV.settings);
      const rs = l.research || {};
      return html`
        <div class="page-head" style="align-items:center">
          <span class="avatar" style="width:44px;height:44px;font-size:15px">${U.initials(l)}</span>
          <div><h1>${PV.leadName(l)}</h1><p class="sub">${l.title || 'No title'} at <b>${l.company || 'No company'}</b> · ${l.location || 'No location'}</p></div>
          <div class="actions">
            <select class="select" data-onchange="status-select" data-id="${l.id}" aria-label="Lead status" style="width:auto">${E.STAGES.map((s) => opt(s.key, l.status, s.label))}</select>
            <button class="btn" data-action="edit-lead" data-id="${l.id}">${icon('edit')}Edit</button>
            <a class="btn" href="#/research/${l.id}">${icon('research')}Research</a>
            <a class="btn" href="#/email/${l.id}">${icon('mail')}Email</a>
            ${l.linkedin ? html`<a class="btn" href="${l.linkedin}" target="_blank" rel="noopener">${icon('linkedin')}LinkedIn</a>` : ''}
          </div>
        </div>
        ${l.founderNote && !l.founderNoteResolved ? html`<div class="banner" style="border-color:#fecaca;background:var(--red-soft)"><b>Founder feedback:</b> ${l.founderNote}<span class="x"><button class="btn sm" data-action="resolve-note" data-id="${l.id}">Mark fixed</button></span></div>` : ''}
        <div class="grid g-main-wide">
          <div class="stack">
            ${outboundCard(l)}
            ${responseCard(l)}
            ${followupCard(l)}
            ${linkedinCard(l)}
            ${l.outreach ? html`<div class="card"><div class="card-h"><h2>Email</h2><span class="sub">Version ${l.outreach.variant || '—'} · ${l.outreach.subject}</span><div class="right"><a class="btn sm" href="#/email/${l.id}">Open in generator</a></div></div><div class="card-b"><div class="preview">${l.outreach.body}</div></div></div>` : ''}
          </div>
          <div class="stack">
            <div class="card"><div class="card-h"><h2>Lead score</h2><div class="right">${U.scoreBadge(sc, true)}</div></div><div class="card-b" data-live="score-parts" data-id="${l.id}">${PV.live['score-parts']({ dataset: { id: l.id } })}</div></div>
            <div class="card"><div class="card-h"><h2>Details</h2></div><div class="card-b"><dl class="kv">
              <dt>Email</dt><dd>${l.email || U.notFound('')} ${U.emailBadge(l.emailStatus)}</dd>
              <dt>Email source</dt><dd>${U.notFound(l.emailSource)}</dd>
              <dt>Industry</dt><dd>${U.notFound(l.industry)}</dd><dt>Company size</dt><dd>${U.notFound(l.companySize)}</dd>
              <dt>Website</dt><dd>${l.website ? html`<a href="${l.website}" target="_blank" rel="noopener">${l.website.replace(/^https?:\/\//, '')}</a>` : U.notFound('')}</dd>
              <dt>LinkedIn</dt><dd>${l.linkedin ? html`<a href="${l.linkedin}" target="_blank" rel="noopener">Profile</a>` : U.notFound('')}</dd>
              <dt>Notes</dt><dd>${U.notFound(l.notes)}</dd>
            </dl></div></div>
            <div class="card"><div class="card-h"><h2>Research summary</h2><div class="right"><span class="badge">${E.researchStatus(l)}</span></div></div><div class="card-b stack-sm">
              <div class="small">${U.notFound(rs.description)}</div>
              ${opps.slice(0, 3).map((o) => html`<div class="opp"><div class="ln"><span class="tag fact">Fact</span>${o.fact}</div><div class="ln"><span class="tag hypothesis">Hypothesis</span>${o.opportunity}</div><div class="src mt-sm">${o.fieldLabel} · ${o.confidence} confidence</div></div>`)}
              ${opps.length ? '' : html`<p class="small muted">No signals recorded yet.</p>`}
            </div></div>
            <div class="card"><div class="card-h"><h2>Activity</h2></div><div class="card-b"><div class="timeline">${(l.activity || []).slice().reverse().map((a) => html`<div class="ev"><span class="when">${new Date(a.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span><span>${a.text}</span></div>`)}</div></div></div>
          </div>
        </div>`;
    }
  };

  Object.assign(PV.actions, {
    'status-select': (el) => { PV.setStatus(el.dataset.id, el.value); U.toast('Status updated'); },
    'li-check': (el, ev) => {
      const key = el.dataset.key;
      PV.mutate(el.dataset.id, (l) => {
        l.linkedinChecklist[key] = el.checked;
        if (el.checked) {
          if (key === 'requestSent') PV.stamp(l, 'linkedinRequested');
          if (key === 'connected') { PV.stamp(l, 'linkedinRequested'); l.linkedinChecklist.requestSent = true; PV.stamp(l, 'connected'); if (l.status === 'sent') l.status = 'connected'; }
          if (key === 'replied') { PV.stamp(l, 'replied'); if (['sent', 'connected'].includes(l.status)) l.status = 'replied'; }
          if (key === 'emailSent') PV.stamp(l, 'sent');
          if (key === 'profileReviewed') PV.log(l, 'LinkedIn profile reviewed');
          if (key === 'followupRequired') PV.log(l, 'Flagged: follow-up required');
        }
      });
    },
    'fu-done': (el) => { PV.mutate(el.dataset.id, (l) => { l.followups[el.dataset.n] = { doneAt: new Date().toISOString() }; PV.log(l, `Follow-up ${el.dataset.n} sent (manually)`); }); U.toast('Follow-up logged'); },
    'fu-skip': (el) => { PV.mutate(el.dataset.id, (l) => { l.followups[el.dataset.n] = { skipped: true, at: new Date().toISOString() }; PV.log(l, `Follow-up ${el.dataset.n} skipped`); }); },
    'resolve-note': (el) => { PV.mutate(el.dataset.id, (l) => { l.founderNoteResolved = true; PV.log(l, 'Founder feedback addressed'); }); }
  });
})();
