#!/usr/bin/env node
/* GBS ads planner CLI. Runs the real Meta Ads Business Calculator and Marketing Planner engine
   (the same js files as the web tool, copied into ./engine) in Node, with a tiny DOM stub.
   Usage:
     node gbs.js list                         calculators, planner industries, modules, markets, objectives, platforms
     node gbs.js fields <calc>                every input of one calculator with unit, default and range
     node gbs.js calc <calc> '<json>' [--html out.html]
     node gbs.js plan '<json>' [--html out.html]
   JSON can also be a path to a .json file. Output is JSON on stdout. */
const fs = require('fs'), path = require('path');

const stubEl = () => ({ addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, getAttribute() { return null; },
  parentElement: { getBoundingClientRect: () => ({ width: 100 }) }, getBoundingClientRect: () => ({ width: 50 }),
  querySelector: () => null, querySelectorAll: () => [], appendChild() {}, remove() {}, closest: () => null,
  value: '1', textContent: '', innerHTML: '', dataset: {}, style: {} });
const define = (o) => Object.entries(o).forEach(([k, value]) => Object.defineProperty(globalThis, k, { value, writable: true, configurable: true }));
define({ document: { documentElement: { classList: { add() {}, remove() {}, toggle() {} } }, querySelector: stubEl, querySelectorAll: () => [],
    addEventListener() {}, createElement: stubEl, body: stubEl() },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, matchMedia: () => ({ matches: false }), navigator: {},
  requestAnimationFrame: () => 0, cancelAnimationFrame() {}, performance: { now: () => 0 } });
globalThis.window = globalThis;
let api; globalThis.__MABC_EXPOSE__ = (x) => { api = x; };
const ENG = [path.join(__dirname, 'engine'), path.join(__dirname, '..', '..', 'js')].find((d) => fs.existsSync(path.join(d, 'app.js')));
const quiet = console.log; console.log = () => {};
for (const f of ['market.js', 'benchmarks.js', 'framework.js', 'industries.js', 'door.js', 'app.js', 'planner-data.js', 'planner.js'])
  (0, eval)(fs.readFileSync(path.join(ENG, f), 'utf8'));
console.log = quiet;
const PLN = globalThis.MABC_PLANNER, PD = globalThis.MABC_PLANNER_DATA;

const out = (o) => process.stdout.write(JSON.stringify(o, null, 2) + '\n');
const fail = (msg, extra) => { out(Object.assign({ error: msg }, extra || {})); process.exit(1); };
const text = (h) => String(h || '').replace(/<(br|\/p|\/li|\/tr|\/h\d|\/div)[^>]*>/gi, '\n').replace(/<\/(b|span|strong|em)>/gi, ' ').replace(/<\/t[dh]>/gi, ' | ').replace(/<[^>]*>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();
const readJSON = (s) => { if (!s) return {}; try { return JSON.parse(fs.existsSync(s) ? fs.readFileSync(s, 'utf8') : s); } catch (e) { fail('Could not read the JSON input: ' + e.message); } };
const flag = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const writeHTML = (file, title, body) => {
  const doc = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>`
    + `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Archivo:wght@400;600;700&display=swap" rel="stylesheet">`
    + `<style>${api.REPORT_CSS}</style></head><body><div class="rep-doc">${body}</div></body></html>`;
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true }); fs.writeFileSync(file, doc); return path.resolve(file);
};
const round = (o) => o && Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 100) / 100 : v]));
const findCalc = (q) => { const M = api.MODELS, s = String(q || '').toLowerCase();
  return M[q] || Object.values(M).find((m) => m.name.toLowerCase() === s) || Object.values(M).find((m) => m.name.toLowerCase().includes(s)); };
const findInd = (q) => { const s = String(q || '').toLowerCase();
  return PD.INDUSTRIES.find((i) => i.id === q) || PD.INDUSTRIES.find((i) => i.label.toLowerCase() === s) || PD.INDUSTRIES.find((i) => i.label.toLowerCase().includes(s)); };
const fieldInfo = (f) => { const o = { id: f.id, label: f.label, group: f.group || undefined };
  if (f.kind === 'opt') { o.type = f.type === 'chips' ? 'list (pick one or more)' : f.type === 'text' ? 'text' : 'choice'; if (f.options) o.options = f.options.map((x) => x[0] + ' = ' + x[1]); }
  else { o.unit = f.unit || ''; o.min = f.min; o.max = f.max; }
  o.default = f.def; if (f.adv) o.advanced = true; return o; };

const [cmd, a1, a2] = process.argv.slice(2);
if (cmd === 'list') {
  const byCat = {}; Object.values(api.MODELS).forEach((m) => { (byCat[m.cat || 'Other'] = byCat[m.cat || 'Other'] || []).push(m.key + ' = ' + m.name); });
  out({ calculators: byCat,
    planner: { industries: PD.INDUSTRIES.map((i) => i.label), modules: PD.MODULES.map((m) => m[0] + ' = ' + m[1] + ' (' + m[2] + ')'),
      countries: Object.entries(PD.COUNTRIES).map(([k, v]) => k + ' = ' + v.label).concat(['other = any other market (set countryName)']),
      objectives: PD.OBJECTIVES.map((o) => o[0] + ' = ' + o[1]), platforms: PD.PLATFORM_ORDER.map((p) => p + ' = ' + PD.PLATFORMS[p].name) } });
} else if (cmd === 'fields') {
  const m = findCalc(a1); if (!m) fail('Unknown calculator. Run: node gbs.js list');
  out({ calculator: m.key, name: m.name, about: m.desc, result_unit: m.unitP, fields: m.fields.filter((f) => f.id !== 'mode').map(fieldInfo),
    presets: (m.presets || []).map((p) => ({ name: p[0], note: p[1], values: p[2] })) });
} else if (cmd === 'calc') {
  const m = findCalc(a1); if (!m) fail('Unknown calculator. Run: node gbs.js list');
  const given = readJSON(a2), ids = new Set(m.fields.map((f) => f.id)), warn = [];
  Object.keys(given).forEach((k) => { if (!ids.has(k)) warn.push(`Ignored "${k}": not an input of ${m.name}. Run fields to see the ids.`); });
  const vals = Object.fromEntries(Object.entries(given).filter(([k]) => ids.has(k)));
  m.fields.forEach((f) => { const v = vals[f.id]; if (typeof v === 'number' && f.kind !== 'opt' && ((f.min != null && v < f.min) || (f.max != null && v > f.max)))
    warn.push(`${f.label} = ${v} is outside the usual range ${f.min} to ${f.max}${f.unit ? ' ' + f.unit : ''}; check it.`); });
  if (vals.spend != null && vals.daily == null && ids.has('daily')) vals.daily = Math.round(vals.spend / 30.4);
  if (vals.mode == null && Object.keys(vals).some((k) => (m.fields.find((f) => f.id === k) || {}).adv)) vals.mode = 'advanced';
  const o = api.open(m.key, vals), v = o.vals, r = m.compute(v), vd = (m.verdict || api.verdict)(r, v);
  const res = { calculator: m.key, name: m.name, verdict: { headline: text(vd.h), detail: text(vd.p || vd.t || '') },
    summary: round(r.k), cards: r.cards.map((c) => ({ metric: c.k, value: text(c.v), note: text(c.s) })),
    inputs_used: Object.fromEntries(m.fields.filter((f) => f.id !== 'mode' && (!f.show || f.show(v))).map((f) => [f.id, v[f.id]])),
    defaults_used: m.fields.filter((f) => f.id !== 'mode' && !(f.id in given) && (!f.show || f.show(v))).map((f) => f.id),
    text_summary: o.summary, warnings: warn };
  const h = flag('--html'); if (h) res.report = writeHTML(h, m.name + ' forecast report', api.reportHTML());
  out(res);
} else if (cmd === 'plan') {
  const st = readJSON(a1), warn = [];
  if (st.industry) { const i = findInd(st.industry); if (!i) fail('Unknown planner industry: ' + st.industry, { industries: PD.INDUSTRIES.map((x) => x.label) }); st.industry = i.id; }
  else warn.push('No industry given; the planner used its first industry. Pass "industry".');
  if (st.country && !PD.COUNTRIES[st.country] && st.country !== 'other') { st.countryName = st.country; st.country = 'other'; }
  if (st.cities == null && st.country && st.country !== 'india') st.cities = '';
  if (Array.isArray(st.cities)) st.cities = st.cities.join(', ');
  if (st.modules === 'all') st.modules = PLN.MOD_ORDER.slice();
  if (!st.modules || !st.modules.length) { st.modules = PLN.MOD_ORDER.filter((x) => x !== 'custom'); warn.push('No modules given; built every standard module.'); }
  const bad = st.modules.filter((x) => !PLN.MOD_ORDER.includes(x)); if (bad.length) fail('Unknown modules: ' + bad.join(', '), { modules: PLN.MOD_ORDER });
  PLN.setState(st); const { c, secs } = PLN.buildPlan(PLN.getState());
  const T = c.fc && c.fc.T;
  const res = { industry: c.ind.label, market: c.countryLabel, objective: c.obj.label, monthly_budget: c.budget,
    platforms: c.platforms.map((p) => ({ id: p, name: PD.PLATFORMS[p].name, share_pct: c.alloc && c.alloc.pct[p], amount: c.alloc && c.alloc.amount[p] })),
    platform_checks: Object.fromEntries(Object.entries(c.evals || {}).map(([p, e]) => [p, { status: e.status, score: e.score, reasons: (e.reasons || []).map(text), cautions: (e.cautions || []).map(text) }])),
    forecast_totals: T ? round(T) : null,
    modules: secs.map((s) => ({ id: s.id, title: s.title, insights: s.ins.map(text), content: text(s.body) })),
    warnings: warn };
  const h = flag('--html'); if (h) res.report = writeHTML(h, 'Marketing plan ' + c.ind.label, PLN.reportBody());
  out(res);
} else {
  process.stdout.write(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace('/*', '') + '\n');
}
