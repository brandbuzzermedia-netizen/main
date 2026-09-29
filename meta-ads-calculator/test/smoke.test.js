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
(0, eval)(fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8'));
assert(api, 'test hook did not fire');

const defaults = (m) => Object.fromEntries(m.fields.map((f) => [f.id, f.def]));
let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('ok  ' + name); };

for (const key of ['service', 'b2b', 'b2c']) {
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
  ['service', 'b2b', 'b2c'].forEach((k) => api.open(k));
});
console.log(`\n${passed} checks passed`);
