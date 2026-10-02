/* Engine tests: run with `npm test`. No dependencies. */
'use strict';
const assert = require('assert');
const E = require('../js/engine.js');
const Seed = require('../js/seed.js');

const S = JSON.parse(JSON.stringify(E.DEFAULT_SETTINGS));
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };

const lead = (r, extra) => E.newLead(Object.assign({ firstName: 'Ana', lastName: 'Ruiz', title: 'CTO', company: 'Acme Wealth LLC', industry: 'Wealth Management',
  location: 'New York, NY, United States', companySize: '51–200', linkedin: 'https://www.linkedin.com/in/ana-ruiz/', email: 'ana@acme.example', research: r || {} }, extra || {}));

t('duplicates: email, LinkedIn URL, company + name', () => {
  const a = lead();
  const d = (b) => E.findDuplicates(b, [a]).map((x) => x.reasons).flat();
  assert.deepStrictEqual(d({ id: 'x', email: 'ANA@acme.example' }), ['Email']);
  assert.deepStrictEqual(d({ id: 'x', linkedin: 'linkedin.com/in/ana-ruiz?trk=1' }), ['LinkedIn URL']);
  assert.deepStrictEqual(d({ id: 'x', firstName: 'ana', lastName: 'ruiz', company: 'Acme Wealth, Inc.' }), ['Company + Name']);
  assert.deepStrictEqual(d({ id: 'x', firstName: 'Bo', lastName: 'Li', company: 'Other' }), []);
  assert.deepStrictEqual(E.findDuplicates(a, [a]), [], 'a lead is not its own duplicate');
});

t('x-ray queries match the brief format and never include auth bypass', () => {
  const qs = E.buildQueries({ industries: ['Wealth Management'], titles: ['CTO', 'VP Engineering', 'Head of Technology'], locations: ['New York'], sizes: ['51–200'] });
  assert.ok(qs.some((q) => q.query === 'site:linkedin.com/in/ ("CTO" OR "VP Engineering" OR "Head of Technology") "wealth management" "New York"'));
  assert.ok(qs.some((q) => q.query === 'site:linkedin.com/in/ "CTO" "wealth management" "New York"'));
  assert.ok(qs.every((q) => q.url.startsWith('https://www.google.com/search?q=')));
  assert.strictEqual(new Set(qs.map((q) => q.query)).size, qs.length, 'no duplicate queries');
  assert.deepStrictEqual(E.buildQueries({ industries: [], titles: ['CTO'] }), []);
});

t('analysis never invents: no research means no opportunities and no email', () => {
  const l = lead();
  assert.strictEqual(E.analyze(l, S).length, 0);
  const g = E.generateOutreach(l, S);
  assert.strictEqual(g.blocked, true);
});

t('analysis separates fact, inference and hypothesis', () => {
  const l = lead({ hiring: 'Hiring 3 automation engineers (careers page, Sept 2026)' });
  const [o] = E.analyze(l, S);
  assert.strictEqual(o.fact, 'Hiring 3 automation engineers (careers page, Sept 2026)', 'fact is verbatim');
  assert.strictEqual(o.ruleId, 'automation');
  assert.ok(o.challenge && o.opportunity && o.challenge !== o.opportunity);
  assert.ok(['High', 'Medium', 'Low'].includes(o.confidence));
});

t('lead score is out of 100 with the six weighted parts and priority bands', () => {
  const empty = E.scoreLead(lead(), S);
  const rich = E.scoreLead(lead({ description: 'x', products: 'y', funding: 'Raised $10M Series A (Aug 2026)', hiring: 'Hiring 2 automation engineers', leadership: 'Appointed a new COO (Sept 2026)', stack: 'Uses Salesforce and spreadsheets', linkedinActivity: 'Posted about manual onboarding' }), S);
  assert.deepStrictEqual(empty.parts.map((p) => p.max), [25, 20, 20, 15, 10, 10]);
  assert.ok(rich.total > empty.total && rich.total <= 100);
  assert.strictEqual(E.priority(80).key, 'high'); assert.strictEqual(E.priority(79).key, 'medium'); assert.strictEqual(E.priority(59).key, 'low');
  assert.strictEqual(E.scoreLead(lead({}, { scoreOverride: 55 }), S).total, 55, 'manual override');
});

t('outreach: three variations, 60-120 words, specific opening, clean lint', () => {
  const l = lead({ description: 'RIA for founders.', hiring: 'Hiring 2 automation engineers (careers page, Sept 2026)', funding: 'Raised a $15M growth round (Aug 2026)' });
  for (let seed = 0; seed < 4; seed++) {
    const g = E.generateOutreach(l, S, { seed });
    assert.strictEqual(g.blocked, false);
    ['A', 'B', 'C'].forEach((k) => {
      const v = g.variants[k];
      assert.ok(v.words >= 60 && v.words <= 120, `${k} has ${v.words} words`);
      const opening = v.body.split('\n\n')[1];
      assert.ok(/hiring 2 automation engineers|raised a \$15M growth round/.test(opening), `${k} opens with an observation: ${opening}`);
      const lint = E.lintEmail(v.body, l, S);
      assert.deepStrictEqual(lint.issues, [], `${k} lint: ${JSON.stringify(lint.issues)}`);
      E.DEFAULT_AVOID.forEach((p) => assert.ok(!v.body.toLowerCase().includes(p), `${k} avoids "${p}"`));
    });
  }
});

t('lint flags numbers that are not in the research and banned phrases', () => {
  const l = lead({ hiring: 'Hiring 2 automation engineers' });
  const r = E.lintEmail("Hope you're doing well. We cut costs by 40% for clients.", l, S);
  assert.ok(r.issues.some((i) => i.level === 'error' && i.text.includes('40%')));
  assert.ok(r.issues.some((i) => i.text.includes("hope you're doing well")));
});

t('case studies are only mentioned when uploaded for the same industry', () => {
  const l = lead({ hiring: 'Hiring 2 automation engineers' });
  assert.ok(!/related work/.test(E.generateOutreach(l, S).variants.B.body));
  const s2 = Object.assign({}, S, { materials: [{ kind: 'case-study', industry: 'Wealth Management', title: 'Onboarding automation for an RIA', content: '...' }] });
  assert.ok(E.generateOutreach(l, s2).variants.B.body.includes('Onboarding automation for an RIA'));
});

t('follow-ups on day 3/7/14 from the send date, stop after a reply', () => {
  const l = lead({ hiring: 'Hiring 2 automation engineers' });
  l.milestones.sent = new Date(2026, 8, 1, 10).toISOString();
  l.status = 'sent';
  const plan = E.followUpPlan(l, S);
  assert.deepStrictEqual(plan.map((f) => f.due), ['2026-09-04', '2026-09-08', '2026-09-15']);
  assert.strictEqual(E.nextFollowUp(l, S).n, 1);
  l.followups[1] = { doneAt: new Date().toISOString() };
  assert.strictEqual(E.nextFollowUp(l, S).n, 2);
  l.status = 'replied'; l.milestones.replied = new Date().toISOString();
  assert.strictEqual(E.nextFollowUp(l, S), null);
});

t('linkedin plan has no pitch in the connection note', () => {
  const p = E.linkedinPlan(lead({ funding: 'Raised $5M seed' }), S);
  assert.ok(!/point vision|automation|service/i.test(p.note));
  assert.ok(p.afterAccept.firstFollowUp && p.afterAccept.conversationStarter && p.afterAccept.valueFollowUp);
});

t('metrics come only from logged milestones', () => {
  const now = new Date();
  const leads = Seed.build(E, S, now);
  assert.ok(leads.every((l) => l.sample && /\.example$/.test(l.email.split('@')[1] || 'x.example')));
  const conv = E.conversions(leads);
  conv.forEach((c) => assert.ok(c.num <= c.den));
  assert.strictEqual(E.conversions([])[0].pct, null, 'no data, no percentage');
  const rep = E.weeklyReport([], now, S);
  assert.strictEqual(rep.insights.industry.top, null);
  assert.strictEqual(rep.totals.sent, 0);
  const today = E.dayKey(now);
  assert.strictEqual(E.activity(leads, today).added, leads.filter((l) => E.dayKey(l.milestones.added) === today).length);
});

console.log(`\n${n} tests passed`);
