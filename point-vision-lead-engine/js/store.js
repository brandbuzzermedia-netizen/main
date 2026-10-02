/* Persistence.
   Local mode: everything lives in this browser's localStorage.
   Shared mode: when the app is served by server.js, leads and settings are
   also synced to the server so the intern and founder see the same data.
   Merging is per lead, newest `updatedAt` wins, deletions are tombstoned. */
(function () {
  'use strict';
  const E = window.PVEngine;
  const KEY = 'pvle:data:v1';
  const SYNC_MS = 12000;

  function deepDefaults(target, defaults) {
    const out = Array.isArray(defaults) ? (Array.isArray(target) ? target : defaults.slice()) : Object.assign({}, target || {});
    if (Array.isArray(defaults)) return out;
    Object.keys(defaults).forEach((k) => {
      const d = defaults[k];
      if (out[k] === undefined || out[k] === null) out[k] = JSON.parse(JSON.stringify(d));
      else if (d && typeof d === 'object' && !Array.isArray(d)) out[k] = deepDefaults(out[k], d);
    });
    return out;
  }

  const Store = {
    mode: 'local',
    online: false,
    lastSync: null,
    data: { settings: null, settingsUpdatedAt: null, leads: [], deleted: [] },
    dirty: new Set(),
    dirtySettings: false,
    listeners: [],

    get settings() { return this.data.settings; },
    get leads() { return this.data.leads; },

    async init() {
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { saved = null; }
      if (saved && saved.leads) {
        this.data = saved;
        this.data.deleted = this.data.deleted || [];
        (saved.dirty || []).forEach((id) => this.dirty.add(id));
        this.dirtySettings = !!saved.dirtySettings;
      } else {
        this.data.settings = JSON.parse(JSON.stringify(E.DEFAULT_SETTINGS));
        this.data.settingsUpdatedAt = new Date(0).toISOString();
        this.data.leads = window.PVSeed.build(E, this.data.settings, new Date());
        this.data.seeded = true;
      }
      this.data.settings = deepDefaults(this.data.settings, E.DEFAULT_SETTINGS);
      // Shared mode is available only when served by server.js.
      if (location.protocol.startsWith('http')) {
        try {
          const r = await fetch('api/health', { cache: 'no-store' });
          if (r.ok && (await r.json()).app === 'pv-lead-engine') {
            this.mode = 'server';
            const fresh = !saved;
            if (fresh) { this.data.leads = []; this.data.seeded = false; }
            await this.sync(true);
            setInterval(() => this.sync(), SYNC_MS);
            window.addEventListener('focus', () => this.sync());
          }
        } catch (e) { /* static hosting: stay local */ }
      }
      this.persist();
    },

    persist() {
      try {
        localStorage.setItem(KEY, JSON.stringify(Object.assign({}, this.data, { dirty: Array.from(this.dirty), dirtySettings: this.dirtySettings })));
      } catch (e) { console.warn('Could not save to localStorage', e); }
    },

    on(fn) { this.listeners.push(fn); },
    emit(source) { this.listeners.forEach((fn) => fn(source || 'local')); },

    lead(id) { return this.data.leads.find((l) => l.id === id) || null; },

    saveLead(lead, opts) {
      lead.updatedAt = new Date().toISOString();
      const i = this.data.leads.findIndex((l) => l.id === lead.id);
      if (i === -1) this.data.leads.unshift(lead); else this.data.leads[i] = lead;
      this.dirty.add(lead.id);
      this.persist();
      this.scheduleSync();
      if (!opts || !opts.silent) this.emit();
    },

    deleteLead(id) {
      this.data.leads = this.data.leads.filter((l) => l.id !== id);
      this.data.deleted.push({ id, at: new Date().toISOString() });
      this.dirty.add(id);
      this.persist();
      this.scheduleSync();
      this.emit();
    },

    saveSettings(opts) {
      this.data.settingsUpdatedAt = new Date().toISOString();
      this.dirtySettings = true;
      this.persist();
      this.scheduleSync();
      if (!opts || !opts.silent) this.emit();
    },

    replaceAll(data) {
      const now = new Date().toISOString();
      const old = this.data.leads.map((l) => l.id);
      this.data.settings = deepDefaults(data.settings || this.data.settings, E.DEFAULT_SETTINGS);
      this.data.settingsUpdatedAt = now;
      this.data.leads = (data.leads || []).map((l) => Object.assign(E.newLead(), l, { updatedAt: now }));
      const keep = new Set(this.data.leads.map((l) => l.id));
      old.filter((id) => !keep.has(id)).forEach((id) => this.data.deleted.push({ id, at: now }));
      old.forEach((id) => this.dirty.add(id));
      this.data.leads.forEach((l) => this.dirty.add(l.id));
      this.dirtySettings = true;
      this.persist();
      this.scheduleSync();
      this.emit();
    },

    scheduleSync() {
      if (this.mode !== 'server') return;
      clearTimeout(this._t);
      this._t = setTimeout(() => this.sync(), 700);
    },

    async sync(initial) {
      if (this.mode !== 'server' || this._syncing) return;
      this._syncing = true;
      const sentIds = Array.from(this.dirty);
      const body = {
        leads: sentIds.map((id) => this.lead(id)).filter(Boolean),
        deleted: this.data.deleted.filter((d) => this.dirty.has(d.id)),
        settings: this.dirtySettings ? this.data.settings : null,
        settingsUpdatedAt: this.data.settingsUpdatedAt
      };
      const sentAt = new Map(body.leads.map((l) => [l.id, l.updatedAt]));
      try {
        const r = await fetch('api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const server = await r.json();
        sentIds.forEach((id) => { const l = this.lead(id); if (!l || l.updatedAt === sentAt.get(id)) this.dirty.delete(id); });
        if (body.settings) this.dirtySettings = false;
        const before = JSON.stringify([this.data.leads.map((l) => l.id + l.updatedAt), this.data.settingsUpdatedAt]);
        const local = new Map(this.data.leads.map((l) => [l.id, l]));
        const merged = server.leads.map((s) => {
          const mine = local.get(s.id);
          return mine && this.dirty.has(s.id) && mine.updatedAt > s.updatedAt ? mine : s;
        });
        // Leads created locally that the server has not seen yet.
        this.data.leads.forEach((l) => { if (this.dirty.has(l.id) && !merged.find((m) => m.id === l.id)) merged.push(l); });
        merged.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        this.data.leads = merged;
        this.data.deleted = server.deleted || [];
        if (!this.dirtySettings && server.settings) {
          this.data.settings = deepDefaults(server.settings, E.DEFAULT_SETTINGS);
          this.data.settingsUpdatedAt = server.settingsUpdatedAt;
        }
        this.online = true;
        this.lastSync = new Date();
        this.persist();
        const after = JSON.stringify([this.data.leads.map((l) => l.id + l.updatedAt), this.data.settingsUpdatedAt]);
        if (initial || before !== after) this.emit('remote');
        else this.emit('status');
      } catch (e) {
        this.online = false;
        this.emit('status');
      } finally {
        this._syncing = false;
      }
    }
  };

  window.PVStore = Store;
})();
