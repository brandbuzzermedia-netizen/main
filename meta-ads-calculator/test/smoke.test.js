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
for (const f of ['market.js', 'door.js', 'app.js']) (0, eval)(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'));
assert(api, 'test hook did not fire');

const defaults = (m) => Object.fromEntries(m.fields.map((f) => [f.id, Array.isArray(f.def) ? f.def.slice() : f.def]));
let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('ok  ' + name); };

for (const key of ['service', 'b2b', 'b2c', 'door']) {
  const m = api.MODELS[key];
  t(`${key}: defaults compute finite numbers`, () => {
    const r = m.compute(defaults(m));
    for (const k of ['units', 'total', 'revenue', 'net', 'roas', 'cac', 'ltvcac']) {
      assert(Number.isFinite(r[k]), `${k} not finite: ${r[k]}`);
    }
    assert(r.funnel.length >= 6 && r.cards.length === 6);
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
    const vd = api.verdict(m.compute(defaults(m)));
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
  ['service', 'b2b', 'b2c', 'door'].forEach((k) => api.open(k));
});

/* ---------- door module ---------- */
const door = api.MODELS.door, dv = (o) => ({ ...defaults(door), ...o });
const near = (a, b, tol = 1e-6) => assert(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);
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
