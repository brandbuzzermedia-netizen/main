/* Dependency-free tests. Run: node test/smoke.test.js
   Loads js/app.js with a tiny DOM stub, then checks formulas and the count-up helpers. */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const stubEl = () => ({
  addEventListener() {}, classList: { add() {}, remove() {} }, setAttribute() {},
  parentElement: { getBoundingClientRect: () => ({ width: 100 }) },
  getBoundingClientRect: () => ({ width: 50 }),
  value: '1', textContent: '', innerHTML: '', dataset: {}, style: {},
});
let rafQueue = [];
const define = (obj) => Object.entries(obj).forEach(([k, value]) =>
  Object.defineProperty(globalThis, k, { value, writable: true, configurable: true }));
define({
  document: { documentElement: { classList: { add() {} } }, querySelector: stubEl,
    querySelectorAll: () => [], addEventListener() {}, createElement: stubEl },
  localStorage: { getItem: () => null, setItem() {} },
  matchMedia: () => ({ matches: false }), navigator: {},
  requestAnimationFrame: (f) => { rafQueue.push(f); return rafQueue.length; },
  cancelAnimationFrame() {}, performance: { now: () => 0 },
});
globalThis.window = globalThis;

let api;
globalThis.__MABC_EXPOSE__ = (x) => { api = x; };
// eslint-disable-next-line no-eval
for (const f of ['market.js', 'benchmarks.js', 'framework.js', 'industries.js', 'door.js', 'app.js']) (0, eval)(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'));
assert(api, 'test hook did not fire');

const defaults = (m) => Object.fromEntries(m.fields.map((f) => [f.id, f.def && typeof f.def === 'object' ? JSON.parse(JSON.stringify(f.def)) : f.def]));
let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('ok  ' + name); };
const near = (a, b, tol = 1e-6) => assert(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);

const KEYS = Object.keys(api.MODELS);
for (const key of KEYS) {
  const m = api.MODELS[key];
  t(`${key}: defaults compute finite numbers`, () => {
    const r = m.compute(defaults(m));
    for (const k of ['units', 'total', 'revenue', 'net', 'roas', 'cac', 'ltvcac']) {
      assert(Number.isFinite(r[k]), `${k} not finite: ${r[k]}`);
    }
    assert(r.funnel.length >= 4 && r.cards.length >= 6 && r.k, 'funnel, cards and k');
  });
  t(`${key}: zero budget gives zero results, no NaN`, () => {
    const r = m.compute({ ...defaults(m), spend: 0 });
    assert.strictEqual(r.units, 0);
    assert(!Number.isNaN(r.net));
  });
  t(`${key}: doubling budget doubles volume at constant CPM`, () => {
    const v = defaults(m);
    const a = m.compute(v).units, b = m.compute({ ...v, spend: v.spend * 2 }).units;
    assert(Math.abs(b / a - 2) < 1e-9);
  });
  t(`${key}: presets only reference real field ids`, () => {
    const ids = new Set(m.fields.map((f) => f.id));
    m.presets.forEach(([, , vals]) => Object.keys(vals).forEach((k) => assert(ids.has(k), `${key} preset uses unknown field ${k}`)));
  });
  t(`${key}: verdict returns a tone and message`, () => {
    const vd = (m.verdict || api.verdict)(m.compute(defaults(m)), defaults(m));
    assert(['good', 'ok', 'warn', 'bad'].includes(vd.t) && vd.h && vd.p);
  });
}

t('service: hand-checked funnel (₹50k, CPM 180, CTR 1.2%, lead 10%)', () => {
  const m = api.MODELS.service, r = m.compute(defaults(m));
  const impr = 50000 / 180 * 1000, leads = impr * 0.012 * 0.10;
  assert(Math.abs(r.leads - leads) < 1e-6);
});
t('b2c: returns reduce kept revenue but not shipping cost', () => {
  const m = api.MODELS.b2c, v = defaults(m);
  const lo = m.compute({ ...v, rto: 0 }), hi = m.compute({ ...v, rto: 30 });
  assert(hi.net < lo.net);
});

const sim = (from, to) => {
  const el = { textContent: from }; rafQueue = [];
  api.tweenText(el, to, from);
  const seen = [el.textContent];
  for (const ts of [100, 275, 550]) { const f = rafQueue.shift(); if (!f) break; f(ts); seen.push(el.textContent); }
  return seen;
};
t('tween: counts up and lands exactly on target', () => {
  const s = sim('₹0', '₹95,000');
  assert.strictEqual(s[s.length - 1], '₹95,000');
  assert(s.length > 2);
});
t('tween: snaps when unit or sign changes', () => {
  assert.deepStrictEqual(sim('₹1.25 L', '₹95,000'), ['₹95,000']);
  assert.deepStrictEqual(sim('-₹5,000', '₹8,000'), ['₹8,000']);
});
t('zeroOf keeps prefix, suffix and decimals', () => {
  assert.strictEqual(api.zeroOf('4.78x'), '0.00x');
  assert.strictEqual(api.zeroOf('₹95,000'), '₹0');
  assert.strictEqual(api.zeroOf('n/a'), undefined);
});
t('render path runs for every model', () => {
  KEYS.forEach((k) => api.open(k));
});

/* ---------- multi industry platform ---------- */
t('catalogue covers every industry and every catalogue entry exists', () => {
  const inCat = new Set(api.CATALOG.flatMap((g) => g.items.map((i) => i.key)));
  KEYS.forEach((k) => assert(inCat.has(k), 'missing from dashboard: ' + k));
  assert(KEYS.length >= 37, 'expected at least 37 calculators, got ' + KEYS.length);
  for (const k of ['service', 'realestate', 'clinic', 'dental', 'education', 'finance', 'travel', 'interior', 'homeservices', 'automotive', 'wedding',
    'b2b', 'manufacturing', 'timber', 'door', 'buildmat', 'machinery', 'saas', 'wholesale', 'b2c', 'd2c', 'fashion', 'beauty', 'furniture',
    'electronics', 'jewellery', 'homedecor', 'food', 'fitness', 'agency', 'legal', 'accounting', 'architecture', 'photography', 'salon', 'consulting', 'custom'])
    assert(api.MODELS[k], 'missing industry ' + k);
});
t('each industry has its own funnel and cost structure', () => {
  const funnels = new Set(), costs = new Set();
  KEYS.forEach((k) => { const r = api.MODELS[k].compute(defaults(api.MODELS[k]));
    funnels.add(r.funnel.map((s) => s.l).join('>')); costs.add(r.pnl.map((x) => x[0]).join('|')); });
  assert(funnels.size >= 25, 'too few distinct funnels: ' + funnels.size);
  assert(costs.size >= 20, 'too few distinct cost structures: ' + costs.size);
});
t('breakeven ROAS comes from each industry\'s own margin', () => {
  const vals = new Set();
  KEYS.forEach((k) => { const m = api.MODELS[k], r = m.compute(defaults(m));
    if (r.x && r.x.mu > 0) { near(r.x.beRoasVar, 1 / r.x.mu); vals.add(r.x.beRoasVar.toFixed(2)); } });
  assert(vals.size >= 15, 'breakeven ROAS should differ by industry: ' + vals.size);
});
t('spec example: ₹5,00,000 revenue on ₹1,00,000 spend is 5.00x ROAS', () => {
  const m = api.MODELS.custom, v = { ...defaults(m), amode: 'manual', cpl: 1000, spend: 100000, cstages: [{ name: 'Customers', rate: 100 }], price: 5000 };
  const r = m.compute(v);
  near(r.k.leads, 100); near(r.k.customers, 100); near(r.revenue, 500000); near(r.roas, 5);
  near(r.k.profitRoas, r.net / 100000); near(r.roi, r.net / r.x.invest * 100);
});
t('validation: rates above 100%, negatives and zero never produce NaN, Infinity or impossible funnels', () => {
  KEYS.forEach((k) => { const m = api.MODELS[k], d = defaults(m);
    const bad = { ...d }; m.fields.forEach((f) => { if (typeof d[f.id] === 'number') bad[f.id] = f.unit === '%' ? 250 : -50; });
    for (const v of [bad, { ...d, spend: 0 }, { ...d, cpm: 0, cpl: 0 }]) {
      const r = m.compute(v);
      assert(!Number.isNaN(r.net) && !Number.isNaN(r.revenue) && r.units >= 0, k + ' invalid result');
      r.funnel.forEach((s, i) => { if (i && isFinite(s.n) && isFinite(r.funnel[i - 1].n) && !/Doors|Repeat|Stays/.test(s.l)) assert(s.n <= r.funnel[i - 1].n + 1e-6, k + ' funnel grows at ' + s.l); });
    }
  });
});
t('counts are whole numbers, never fractional or negative', () => {
  assert.strictEqual(api.cnt(5.88), '6'); assert.strictEqual(api.cnt(0.4), 'under 1'); assert.strictEqual(api.cnt(-3), '0'); assert.strictEqual(api.cnt(NaN), 'n/a');
});
t('real estate: commission revenue and cost per site visit', () => {
  const m = api.MODELS.realestate, r = m.compute(defaults(m));
  near(r.revenue, r.units * 8000000 * 0.02);
  const dev = m.compute({ ...defaults(m), reMode: 'developer' }); near(dev.revenue, dev.units * 8000000);
});
t('timber: landed cost per CFT and CBM conversion', () => {
  const m = api.MODELS.timber, v = defaults(m), r = m.compute(v), t = r.x.e.timber, CF = 35.3147;
  const landedCbm = (38000 + 1500 + 4500) * 1.10 + 1200 + 1500 + 800;
  near(t.landedCbm, landedCbm); near(t.landedCft, landedCbm / CF / 0.88 + 60); near(t.cft, r.units * 150); near(t.cbm, t.cft / CF);
  const c = m.compute({ ...v, tunit: 'cbm', volCbm: 150 / CF, sellCbm: 2100 * CF }); near(c.revenue, r.revenue);
});
t('SaaS: first year revenue follows churn, MRR and ARR shown', () => {
  const m = api.MODELS.saas, v = { ...defaults(m), churn: 0, annualShare: 0 }, r = m.compute(v);
  near(r.revenue, r.units * 2500 * 12);
  assert(r.more.some((x) => x[0] === 'ARR added'));
});
t('ecommerce: returns lower profit and are in the breakeven ROAS', () => {
  const m = api.MODELS.b2c, v = defaults(m), a = m.compute({ ...v, rto: 0 }), b = m.compute({ ...v, rto: 30 });
  assert(b.net < a.net && b.x.beRoasVar > a.x.beRoasVar);
});
t('custom builder: stages multiply through', () => {
  const m = api.MODELS.custom, v = { ...defaults(m), cstages: [{ name: 'A', rate: 50 }, { name: 'B', rate: 40 }, { name: 'C', rate: 30 }] }, r = m.compute(v);
  near(r.units, r.leads * 0.5 * 0.4 * 0.3);
});
t('manual mode: leads = spend ÷ CPL; ecommerce purchases = spend ÷ CPP', () => {
  const s = api.MODELS.service, r = s.compute({ ...defaults(s), amode: 'manual', cpl: 250 }); near(r.leads, 50000 / 250);
  const e = api.MODELS.b2c, q = e.compute({ ...defaults(e), amode: 'manual', cpl: 500 }); near(q.units, 100000 / 500);
});
t('every industry: page, summary and report have no NaN, Infinity, dashes or hyphens', () => {
  KEYS.forEach((k) => {
    for (const vals of [{}, { mode: 'advanced' }, { spend: 0 }, { mode: 'advanced', amode: 'manual' }]) {
      const o = api.open(k, vals), rep = api.reportHTML();
      const text = (o.html + ' ' + o.summary + ' ' + rep).replace(/<[^>]*>/g, ' ');
      assert(!/NaN|Infinity|undefined/.test(text), k + ' shows NaN/Infinity/undefined: ' + (text.match(/.{20}(NaN|Infinity|undefined).{20}/) || [])[0]);
      assert(/not guaranteed/.test(o.html + rep), k + ' missing the estimate disclaimer');
      assert(!/[\u2012-\u2015\u2212]/.test(text), k + ' dash character in visible copy');
      const h = text.match(/\S*[A-Za-z]-[A-Za-z]\S*/); assert(!h, k + ' hyphenated word: ' + (h && h[0]));
    }
  });
});

/* ---------- door module ---------- */
const door = api.MODELS.door, dv = (o) => ({ ...defaults(door), ...o });
t('door: spec example, 30 leads to 2 orders, ROAS 4.00x, profit ROAS 0.67x', () => {
  // ₹15,000 ÷ ₹500 CPL = 30 leads → 15 qualified → 8 quotations → 5 visits → 2 orders; 6 doors per order at ₹5,000
  const r = door.compute(dv({ mode: 'simple', fmode: 'cpl', spend: 15000, cpl: 500, qualRate: 50, quoteRate: 800 / 15,
    visitRate: 62.5, orderRate: 40, doorsPerOrder: 6, sellDoor: 5000, simpleCost: 35000 / 12, fixed: 0 }));
  near(r.leads, 30); near(r.x.qual, 15); near(r.x.quotes, 8); near(r.x.visits, 5); near(r.units, 2); near(r.x.doors, 12);
  near(r.revenue, 60000); near(r.roas, 4); near(r.net, 10000); near(r.x.profitRoas, 10000 / 15000);
  near(r.roi, 10000 / 50000 * 100);
});
t('door: door area and price per sq ft', () => {
  const r = door.compute(dv({ mode: 'advanced', priceMode: 'sqft', width: 3, height: 7, sellSqft: 250 }));
  near(r.x.price, 21 * 250);
  const r2 = door.compute(dv({ mode: 'advanced', priceMode: 'door', sellDoor: 5000 }));
  near(r2.x.price, 5000);
});
t('door: manufacturer cost lines add up, labour per door vs monthly', () => {
  const v = dv({ mode: 'advanced', biz: 'mfg' }), ec = door.compute(v).x.ec;
  near(ec.cost, ec.lines.reduce((a, l) => a + l.val, 0));
  near(ec.L.raw, 70 * 21 * 1.08);
  near(ec.L.lam, 850 * 2 * 1.05);
  const m = door.compute({ ...v, labourMode: 'month', lbMonthly: 300000, prod: 600 }).x.ec;
  near(m.L.labour, 500);
  near(ec.L.trans, 4000 / 40);
  assert(ec.contrib > ec.gp, 'contribution should exclude fixed overhead');
});
t('door: retailer shows landed cost, not manufacturing', () => {
  const ec = door.compute(dv({ mode: 'advanced', biz: 'retail' })).x.ec;
  assert(!('raw' in ec.L) && !('labour' in ec.L) && 'buy' in ec.L);
  near(ec.L.buy, 4600 * 0.95);
});
t('door: installation only counted when you pay', () => {
  const a = door.compute(dv({ mode: 'advanced', instPayer: 'customer' })).x.ec.L.inst;
  const b = door.compute(dv({ mode: 'advanced', instPayer: 'mfg' })).x.ec.L.inst;
  assert.strictEqual(a, 0); near(b, 750);
});
t('door: at breakeven ROAS the campaign makes zero profit', () => {
  const v = dv({ mode: 'advanced', fixed: 5000 }), r = door.compute(v);
  // same budget and margins; change CPM so ROAS lands exactly on the breakeven ROAS
  const z = door.compute({ ...v, cpm: v.cpm * r.roas / r.x.beRoas });
  near(z.roas, r.x.beRoas);
  near(z.net, 0, 1e-6);
});
t('door: breakeven CPL gives zero profit in CPL mode', () => {
  const v = dv({ mode: 'advanced', fmode: 'cpl', cpl: 300, fixed: 8000 }), r = door.compute(v);
  near(door.compute({ ...v, cpl: r.x.beCpl }).net, 0, 1e-6);
});
t('door: conservative < expected < aggressive', () => {
  const v = dv({}), [c, e, a] = ['cons', 'exp', 'opt'].map((k) => api.scenarioOf(door, v, k));
  assert(c.x.doors < e.x.doors && e.x.doors < a.x.doors);
});
t('door: dealer campaign funnel and LTV', () => {
  const r = door.compute(dv({ mode: 'advanced', objective: 'dealer' }));
  assert(r.x.trade && r.unit === 'dealer' && r.units > 0 && r.cards.length === 6);
  near(r.ltv, (30 + 4 * 20 * 2) * r.x.gpDoor);
});
t('door: market reference gives a labelled range', () => {
  const M = globalThis.MABC_MARKET, ref = M.lookup('door', 'laminated', 'Mumbai', 'premium');
  assert(ref.low < ref.high && ref.row.source && ref.row.updated);
  near(ref.low, 260 * 1.12 * 1.4);
  assert(/Indicative market reference/.test(M.note));
  const m = door.actions, v = dv({});
  m.mref(v); assert(v.sellDoor > 0 && v.sellDoor !== 6720);
});
t('door: page and summary say projections are not guaranteed, with no dashes', () => {
  for (const vals of [{}, { mode: 'advanced' }, { mode: 'advanced', biz: 'both' }, { mode: 'advanced', objective: 'arch' }]) {
    const o = api.open('door', vals);
    assert(/not guaranteed Meta Ads results/.test(o.html) && /not guaranteed Meta Ads results/.test(o.summary));
    const text = (o.html + o.summary).replace(/<[^>]*>/g, ' ');
    assert(!/[\u2012-\u2015\u2212]/.test(text), 'dash character in visible copy');
    assert(!/[A-Za-z]-[A-Za-z]/.test(text), 'hyphenated word in visible copy: ' + (text.match(/\S*[A-Za-z]-[A-Za-z]\S*/) || [])[0]);
  }
});
console.log(`\n${passed} checks passed`);
