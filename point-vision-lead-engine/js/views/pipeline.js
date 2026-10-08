/* Kanban pipeline with drag-and-drop (and a stage menu on touch screens). */
(function () {
  'use strict';
  const PV = window.PV, E = PV.E, U = PV.U, S = PV.S;
  const { html, icon } = U;

  function daysIn(l) {
    const m = l.milestones[E.STAGE_BY_KEY[l.status].milestone] || l.updatedAt;
    const d = Math.floor((Date.now() - new Date(m).getTime()) / 86400000);
    return d <= 0 ? 'today' : d + 'd';
  }

  PV.views.pipeline = {
    render() {
      const q = (PV.prefs.pipeQ || '').toLowerCase();
      const leads = PV.leads.filter((l) => !q || [PV.leadName(l), l.company, l.title, l.industry].join(' ').toLowerCase().includes(q));
      const today = PV.today();
      const open = PV.leads.filter((l) => !['won', 'lost', 'notInterested'].includes(l.status)).length;
      return html`
        <div class="page-head"><div><h1>Pipeline</h1><p class="sub">${open} open · ${PV.leads.filter((l) => l.status === 'won').length} won. Drag cards between stages. On a phone, use the stage menu on each card.</p></div>
          <div class="actions"><div class="search">${icon('search')}<input class="input" id="pipe-q" placeholder="Filter cards…" value="${PV.prefs.pipeQ || ''}" aria-label="Filter pipeline"></div></div></div>
        <div class="kanban" id="kanban">${E.STAGES.map((s) => {
          const items = leads.filter((l) => l.status === s.key).map((l) => ({ l, sc: PV.score(l) })).sort((a, b) => b.sc.total - a.sc.total);
          return html`<section class="kcol" data-stage="${s.key}" aria-label="${s.label}">
            <div class="kh">${U.statusBadge(s.key)}<span class="n">${items.length}</span></div>
            <div class="kb">${items.map(({ l, sc }) => {
              const fu = E.nextFollowUp(l, PV.settings);
              return html`<article class="kcard" draggable="true" data-id="${l.id}">
                <a href="#/lead/${l.id}" style="text-decoration:none"><div class="nm">${PV.leadName(l)}</div><div class="co">${l.title} · ${l.company}</div></a>
                <div class="ft">${U.scoreBadge(sc)}${fu ? html`<span class="badge ${fu.due <= today ? 'b-coral' : ''}" title="Next follow-up">FU ${U.dueLabel(fu.due)}</span>` : ''}<span class="age" title="Time in this stage">${daysIn(l)}</span></div>
                <div class="move"><select class="select sm" data-onchange="status-select" data-id="${l.id}" aria-label="Move ${PV.leadName(l)} to stage">${E.STAGES.map((x) => PV.opt(x.key, l.status, x.label))}</select></div>
              </article>`;
            })}</div>
          </section>`;
        })}</div>`;
    },
    mount(root) {
      const kb = root.querySelector('#kanban');
      if (PV._kanbanScroll) kb.scrollLeft = PV._kanbanScroll;
      kb.addEventListener('scroll', () => { PV._kanbanScroll = kb.scrollLeft; });
      const qEl = root.querySelector('#pipe-q');
      qEl.addEventListener('input', () => {
        PV.prefs.pipeQ = qEl.value; PV.savePrefs();
        clearTimeout(PV._pq);
        PV._pq = setTimeout(() => { PV.render(); const n = document.getElementById('pipe-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 180);
      });
      let dragId = null;
      kb.addEventListener('dragstart', (e) => {
        const c = e.target.closest('.kcard');
        if (!c) return;
        dragId = c.dataset.id;
        c.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dragId);
      });
      kb.addEventListener('dragend', (e) => { const c = e.target.closest('.kcard'); if (c) c.classList.remove('dragging'); kb.querySelectorAll('.over').forEach((x) => x.classList.remove('over')); });
      kb.addEventListener('dragover', (e) => {
        const col = e.target.closest('.kcol');
        if (!col || !dragId) return;
        e.preventDefault();
        kb.querySelectorAll('.over').forEach((x) => { if (x !== col) x.classList.remove('over'); });
        col.classList.add('over');
      });
      kb.addEventListener('drop', (e) => {
        const col = e.target.closest('.kcol');
        if (!col) return;
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain') || dragId;
        dragId = null;
        const l = S.lead(id);
        if (l && l.status !== col.dataset.stage) {
          PV.setStatus(id, col.dataset.stage);
          U.toast(`${PV.leadName(l)} → ${E.STAGE_BY_KEY[col.dataset.stage].label}`);
        }
      });
    }
  };
})();
