/* Point Vision Lead Engine: pure logic.
   Everything here is deterministic and works only from data the team entered.
   Nothing in this file looks anything up, scrapes, or sends. It runs in the
   browser (window.PVEngine) and in Node (require) for the tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PVEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Reference data                                                      */
  /* ------------------------------------------------------------------ */

  const INDUSTRIES = ['SaaS', 'FinTech', 'Wealth Management', 'Real Estate', 'Healthcare', 'Manufacturing',
    'Logistics', 'E-commerce', 'Professional Services', 'Financial Services', 'Education', 'Other'];

  const TITLES = ['Founder', 'Co-Founder', 'CEO', 'CTO', 'CIO', 'COO', 'VP Engineering', 'VP Technology',
    'Head of Engineering', 'Head of Technology', 'Head of Operations', 'Head of Digital Transformation',
    'Head of Automation'];

  const SIZES = ['1–10', '11–50', '51–200', '201–500', '501–1,000', '1,000+'];

  // LinkedIn company pages print headcount like "51-200 employees".
  const SIZE_LINKEDIN = { '1–10': '2-10 employees', '11–50': '11-50 employees', '51–200': '51-200 employees',
    '201–500': '201-500 employees', '501–1,000': '501-1,000 employees', '1,000+': '1,001-5,000 employees' };

  const EMAIL_STATUSES = ['Unverified', 'Valid', 'Risky', 'Catch-all', 'Invalid', 'Not Found'];
  const EMAIL_SOURCES = ['Company website', 'Pattern + verifier', 'Hunter (free tier)', 'Apollo (free tier)',
    'LinkedIn profile', 'Press release / article', 'Referral', 'Other'];

  const STAGES = [
    { key: 'new', label: 'New', milestone: 'added' },
    { key: 'researching', label: 'Researching', milestone: 'researchStarted' },
    { key: 'researchComplete', label: 'Research Complete', milestone: 'researched' },
    { key: 'drafted', label: 'Email Drafted', milestone: 'drafted' },
    { key: 'review', label: 'Founder Review', milestone: 'submitted' },
    { key: 'approved', label: 'Approved', milestone: 'approved' },
    { key: 'sent', label: 'Email Sent', milestone: 'sent' },
    { key: 'connected', label: 'LinkedIn Connected', milestone: 'connected' },
    { key: 'replied', label: 'Replied', milestone: 'replied' },
    { key: 'positive', label: 'Positive Reply', milestone: 'positive' },
    { key: 'meeting', label: 'Meeting Booked', milestone: 'meeting' },
    { key: 'qualified', label: 'Qualified', milestone: 'qualified' },
    { key: 'proposal', label: 'Proposal', milestone: 'proposal' },
    { key: 'won', label: 'Won', milestone: 'won' },
    { key: 'lost', label: 'Lost', milestone: 'lost' },
    { key: 'notInterested', label: 'Not Interested', milestone: 'notInterested' }
  ];
  const STAGE_BY_KEY = Object.fromEntries(STAGES.map((s, i) => [s.key, Object.assign({ index: i }, s)]));

  // A later milestone proves an earlier one happened (a booked meeting means
  // they replied). Used only for funnel maths, never to write dates.
  const IMPLIED_BY = {
    replied: ['positive', 'meeting', 'qualified', 'proposal', 'won', 'notInterested'],
    positive: ['meeting', 'qualified', 'proposal', 'won'],
    meeting: ['qualified', 'proposal', 'won'],
    qualified: ['proposal', 'won'],
    proposal: ['won'],
    researched: ['drafted', 'submitted', 'approved', 'sent'],
    drafted: ['submitted', 'approved', 'sent'],
    submitted: ['approved'],
    connected: []
  };

  const CTA_STYLES = {
    interest: { label: 'Soft interest check', lines: ['Worth comparing notes for 15 minutes?', 'Open to a short conversation about it?', 'Would a quick call to compare notes be useful?'] },
    meeting: { label: 'Specific meeting ask', lines: ['Open to a 20-minute call next week?', 'Could we find 20 minutes next week?', 'Any chance of a 20-minute call in the next couple of weeks?'] },
    resource: { label: 'Offer something useful', lines: ['Want me to send a one-page outline of how we would approach it?', 'Happy to send a short written outline first, if that is easier.', 'Shall I send over a brief outline you can look at in your own time?'] },
    question: { label: 'Priority question', lines: ['Is this on your list for the next quarter?', 'Is this something you are already working on?', 'Is this a priority right now, or later in the year?'] }
  };

  const DEFAULT_AVOID = ["hope you're doing well", 'hope you are doing well', 'i came across your profile',
    'i wanted to reach out', 'we are a leading', 'just checking in', 'touching base', 'circle back',
    'i hope this email finds you', 'quick question', 'synergy', 'game-changer', 'game changer', 'cutting-edge',
    'cutting edge', 'revolutionize', 'revolutionise', 'leverage', 'seamless', 'unlock', 'delve', 'world-class',
    'best-in-class', 'in today\'s fast-paced', 'elevate'];

  const DEFAULT_SETTINGS = {
    company: {
      name: 'Point Vision',
      website: 'https://pointvision.in',
      description: 'Point Vision helps businesses use technology, automation and AI to remove manual work, streamline workflows and run more efficiently.',
      services: ['Technology solutions', 'Automation', 'AI implementation', 'Business process automation',
        'Custom technology solutions', 'Workflow optimisation', 'Digital transformation',
        'Lead and sales process automation', 'Operational efficiency'],
      valueProps: ['Scope one workflow at a time, so value shows up in weeks rather than quarters',
        'Build around how the team already works instead of forcing a new platform on them',
        'Use AI where it removes real manual effort, not for its own sake'],
      senderName: '',
      senderRole: 'Founder',
      signature: ''
    },
    icp: {
      industries: ['FinTech', 'Wealth Management', 'Financial Services', 'SaaS'],
      titles: ['Founder', 'CEO', 'CTO', 'CIO', 'COO', 'VP Engineering', 'Head of Technology', 'Head of Operations'],
      locations: [{ country: 'United States', state: 'New York', city: 'New York' }],
      sizes: ['11–50', '51–200', '201–500'],
      keywords: []
    },
    outreach: {
      dailyTarget: 15,
      tone: 'C',
      ctaStyle: 'interest',
      followUpDays: [3, 7, 14],
      minWords: 60,
      maxWords: 120,
      avoidPhrases: DEFAULT_AVOID.slice()
    },
    scoring: { icp: 25, decision: 20, opportunity: 20, company: 15, personalization: 10, timing: 10 },
    materials: []
  };

  /* ------------------------------------------------------------------ */
  /* Research schema                                                     */
  /* ------------------------------------------------------------------ */

  // `lead` fields are introduced in the email with a short lead-in so the
  // opening sentence always quotes the intern's own observation verbatim.
  const RESEARCH = [
    { section: 'overview', title: 'Company Overview', hint: 'What the company does, in its own words.', fields: [
      { key: 'description', label: 'Company description', placeholder: 'Paste the one-line description from their website or LinkedIn page.' },
      { key: 'products', label: 'Products / services', placeholder: 'Main products or services they sell.' }
    ] },
    { section: 'signals', title: 'Recent Signals', hint: 'Things that changed recently. Include the date and source where you can.', fields: [
      { key: 'blog', noun: 'recent post', label: 'Recent blog posts', type: 'content', lead: (c) => `Read ${poss(c)} recent post: ` },
      { key: 'news', noun: 'recent news', label: 'Recent news', type: 'news', lead: (c) => `Saw the recent ${c} news: ` },
      { key: 'launch', noun: 'launch', label: 'Recent product launch', type: 'launch', timing: true, lead: (c) => `Saw ${poss(c)} recent launch: ` },
      { key: 'funding', noun: 'funding news', label: 'Funding', type: 'funding', timing: true, lead: (c) => `Saw the funding news at ${c}: ` },
      { key: 'hiring', noun: 'hiring', label: 'Hiring', type: 'hiring', timing: true, lead: (c) => `Noticed ${poss(c)} open roles: ` },
      { key: 'leadership', noun: 'leadership news', label: 'New leadership', type: 'leadership', timing: true, lead: (c) => `Saw the leadership news at ${c}: ` },
      { key: 'techChanges', noun: 'stack change', label: 'Technology changes', type: 'tech', timing: true, lead: (c) => `Noticed a change in ${poss(c)} stack: ` },
      { key: 'expansion', noun: 'expansion', label: 'Expansion', type: 'expansion', timing: true, lead: (c) => `Saw ${poss(c)} expansion news: ` },
      { key: 'partnerships', noun: 'partnership', label: 'Partnerships', type: 'partnership', timing: true, lead: (c) => `Saw ${poss(c)} new partnership: ` }
    ] },
    { section: 'tech', title: 'Technology Signals', hint: 'Only what you can see publicly: job posts, their site, case studies.', fields: [
      { key: 'stack', noun: 'stack', label: 'Technology stack', type: 'tech', lead: (c) => `Looked at ${poss(c)} stack: ` },
      { key: 'engHiring', noun: 'engineering hiring', label: 'Engineering hiring', type: 'hiring', timing: true, lead: (c) => `Noticed ${poss(c)} engineering hiring: ` },
      { key: 'transformation', noun: 'transformation work', label: 'Digital transformation initiatives', type: 'transformation', timing: true, lead: (c) => `Saw ${poss(c)} transformation work: ` },
      { key: 'automation', noun: 'operations setup', label: 'Automation opportunities', type: 'automation', lead: (c) => `One thing stood out about ${c}: ` },
      { key: 'complexity', noun: 'operations setup', label: 'Operational complexity', type: 'complexity', lead: (c) => `One thing stood out about ${c}: ` }
    ] },
    { section: 'exec', title: 'Executive Signals', hint: 'What the prospect personally said or did in public.', fields: [
      { key: 'linkedinActivity', noun: 'recent LinkedIn post', label: 'Recent LinkedIn activity', type: 'personal', lead: () => 'Read your recent LinkedIn post: ' },
      { key: 'interviews', noun: 'recent interview', label: 'Public interviews / podcasts', type: 'personal', lead: () => 'Caught your recent interview: ' },
      { key: 'articles', noun: 'recent article', label: 'Articles', type: 'personal', lead: () => 'Read your recent article: ' },
      { key: 'conferences', noun: 'conference session', label: 'Conference appearances', type: 'personal', lead: () => 'Saw your conference session: ' },
      { key: 'announcements', noun: 'announcement', label: 'Company announcements', type: 'news', lead: (c) => `Saw ${poss(c)} announcement: ` }
    ] }
  ];
  const FIELD = {};
  RESEARCH.forEach((s) => s.fields.forEach((f) => { FIELD[f.key] = Object.assign({ section: s.section }, f); }));
  FIELD.hiringRoles = { key: 'hiringRoles', noun: 'hiring', label: 'Hiring signal', section: 'hiring', type: 'hiring', timing: true,
    lead: (c) => `Noticed ${c} is hiring: ` };
  const SIGNAL_FIELDS = Object.keys(FIELD).filter((k) => FIELD[k].section !== 'overview');

  /* ------------------------------------------------------------------ */
  /* Small helpers                                                       */
  /* ------------------------------------------------------------------ */

  const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const has = (s) => clean(s).length > 0;
  const words = (s) => (clean(s).match(/[A-Za-z0-9][A-Za-z0-9'’&.%$,-]*/g) || []).length;
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  // Lower-case a leading verb ("Hiring…", "Raised…") or article, never a proper noun.
  const lcFirst = (s) => (/^([A-Z][a-z]+(ed|ing)|A|An|The|Our|Their|Its|One|Each|Every|Building|Moving|Expansion|New|Growth|Reporting|Compliance|Visible|Transformation|Hiring|Expanding|Launches|Migrations|Post-funding)\b/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
  const poss = (n) => (/s$/i.test(n) ? n + '\u2019' : n + '\u2019s').replace(/\u2019/g, "'");
  const lcService = (s) => clean(s).split(' ').map((w) => (/^[A-Z]{2,}$/.test(w) || /^[A-Z][a-z]*[A-Z]/.test(w) ? w : w.toLowerCase())).join(' ');
  const pick = (arr, seed, salt) => arr[Math.abs(((seed || 0) * 7 + (salt || 0) * 3)) % arr.length];

  function dayKey(d) {
    const x = d instanceof Date ? d : new Date(d);
    if (isNaN(x)) return '';
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function startOfWeek(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); return x; }

  // First sentence, trimmed to something that fits in an opening line.
  function shortFact(text, max, keepParens) {
    max = max || 26;
    let s = clean(text);
    if (!keepParens) s = s.replace(/\s*\([^)]*\)/g, '').replace(/\s+([.,;:])/g, '$1');
    const first = s.match(/^(.+?[.!?])(\s|$)/);
    if (first && words(first[1]) >= 4) s = first[1];
    s = s.replace(/[.!?]+$/, '');
    const w = s.split(' ');
    if (w.length > max) s = w.slice(0, max).join(' ').replace(/[,;:–-]+$/, '') + '…';
    return s;
  }

  function fullName(l) { return clean((l.firstName || '') + ' ' + (l.lastName || '')); }

  /* ------------------------------------------------------------------ */
  /* Leads                                                               */
  /* ------------------------------------------------------------------ */

  function emptyResearch() {
    const r = { hiringRoles: [], sources: '' };
    Object.keys(FIELD).forEach((k) => { if (k !== 'hiringRoles') r[k] = ''; });
    return r;
  }

  function newLead(fields, now) {
    const t = (now || new Date()).toISOString();
    const lead = Object.assign({
      id: uid(), firstName: '', lastName: '', title: '', company: '', website: '', linkedin: '', location: '',
      industry: '', companySize: '', email: '', emailSource: '', emailStatus: 'Unverified', notes: '',
      scoreOverride: null, status: 'new', createdAt: t, updatedAt: t,
      milestones: { added: t }, research: emptyResearch(), founderInsight: '', founderNote: '',
      outreach: null, linkedinChecklist: { profileReviewed: false, requestSent: false, connected: false, replied: false, followupRequired: false },
      followups: {}, activity: [{ at: t, text: 'Lead added' }]
    }, fields || {});
    lead.research = Object.assign(emptyResearch(), lead.research || {});
    return lead;
  }

  function normLinkedIn(url) {
    const s = clean(url).toLowerCase().replace(/^https?:\/\//, '').replace(/^([a-z]{2,3}\.)?www\./, '').replace(/^[a-z]{2}\./, '');
    const m = s.match(/linkedin\.com\/(in|pub)\/([^/?#]+)/);
    return m ? m[2].replace(/\/$/, '') : s.replace(/[?#].*$/, '').replace(/\/$/, '');
  }
  function normCompany(c) {
    return clean(c).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\b(the|inc|incorporated|llc|ltd|limited|corp|corporation|co|company|group|plc|pvt|gmbh)\b/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function normName(l) { return (clean(l.firstName) + ' ' + clean(l.lastName)).toLowerCase().replace(/[^a-z ]/g, '').trim(); }

  function findDuplicates(candidate, leads) {
    const out = [];
    const email = clean(candidate.email).toLowerCase();
    const li = has(candidate.linkedin) ? normLinkedIn(candidate.linkedin) : '';
    const co = normCompany(candidate.company);
    const nm = normName(candidate);
    (leads || []).forEach((l) => {
      if (l.id === candidate.id) return;
      const reasons = [];
      if (email && clean(l.email).toLowerCase() === email) reasons.push('Email');
      if (li && has(l.linkedin) && normLinkedIn(l.linkedin) === li) reasons.push('LinkedIn URL');
      if (co && nm && normCompany(l.company) === co && normName(l) === nm) reasons.push('Company + Name');
      if (reasons.length) out.push({ lead: l, reasons });
    });
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Lead Finder: Google X-ray queries                                   */
  /* ------------------------------------------------------------------ */

  const INDUSTRY_TERMS = {
    'SaaS': ['SaaS', 'software'], 'FinTech': ['fintech', 'payments'],
    'Wealth Management': ['wealth management', 'RIA', 'family office'], 'Real Estate': ['real estate', 'proptech'],
    'Healthcare': ['healthcare', 'health tech'], 'Manufacturing': ['manufacturing', 'industrial'],
    'Logistics': ['logistics', 'supply chain'], 'E-commerce': ['e-commerce', 'DTC'],
    'Professional Services': ['professional services', 'consulting'],
    'Financial Services': ['financial services', 'asset management'], 'Education': ['education', 'edtech']
  };

  const q = (s) => '"' + clean(s).replace(/"/g, '') + '"';
  const orGroup = (arr) => (arr.length > 1 ? '(' + arr.map(q).join(' OR ') + ')' : q(arr[0]));
  const locLabel = (l) => clean(l.city || l.state || l.country || l.custom || '');

  function buildQueries(input) {
    const titles = (input.titles || []).filter(has);
    const industries = (input.industries || []).filter(has);
    const locations = (input.locations || []).map((l) => (typeof l === 'string' ? l : locLabel(l))).filter(has);
    const keywords = (input.keywords || []).filter(has);
    const sizes = (input.sizes || []).filter(has);
    const out = [];
    const seen = new Set();
    const push = (group, label, query, note) => {
      query = query.replace(/\s+/g, ' ').trim();
      if (seen.has(query)) return;
      seen.add(query);
      out.push({ group, label, query, note: note || '', url: 'https://www.google.com/search?q=' + encodeURIComponent(query) });
    };
    if (!titles.length || !industries.length) return out;
    const inds = industries.slice(0, 3);
    const locs = locations.length ? locations.slice(0, 2) : [''];
    const L = (loc) => (loc ? ' ' + q(loc) : '');
    const kw = keywords.length ? ' ' + keywords.map(q).join(' ') : '';
    const csuite = titles.filter((t) => /founder|ceo|cto|cio|coo|chief/i.test(t));
    const leaders = titles.filter((t) => /vp|head|director/i.test(t));
    const noise = ' -intitle:jobs -recruiter -"talent acquisition"';

    inds.forEach((ind) => {
      const term = (INDUSTRY_TERMS[ind] || [ind])[0];
      locs.forEach((loc) => {
        const where = loc ? ` in ${loc}` : '';
        push('People', `All target titles · ${ind}${where}`, `site:linkedin.com/in/ ${orGroup(titles.slice(0, 6))} ${q(term)}${L(loc)}`);
        if (csuite.length) push('People', `C-suite and founders · ${ind}${where}`, `site:linkedin.com/in/ ${orGroup(csuite.slice(0, 4))} ${q(term)}${L(loc)}`);
        if (leaders.length) push('People', `VP and Head-of roles · ${ind}${where}`, `site:linkedin.com/in/ ${orGroup(leaders.slice(0, 4))} ${q(term)}${L(loc)}`);
        titles.slice(0, 3).forEach((t) => push('People', `${t} only · ${ind}${where}`, `site:linkedin.com/in/ ${q(t)} ${q(term)}${L(loc)}`));
        const syn = INDUSTRY_TERMS[ind] || [];
        if (syn.length > 1) push('People', `Industry synonyms · ${ind}${where}`, `site:linkedin.com/in/ ${orGroup(titles.slice(0, 3))} ${orGroup(syn)}${L(loc)}`, 'Catches profiles that describe the industry differently.');
        if (kw) push('People', `With your keywords · ${ind}${where}`, `site:linkedin.com/in/ ${orGroup(titles.slice(0, 4))} ${q(term)}${L(loc)}${kw}`);
        push('People', `Noise removed · ${ind}${where}`, `site:linkedin.com/in/ ${orGroup(titles.slice(0, 4))} ${q(term)}${L(loc)}${noise}`, 'Drops recruiters and job listings.');
        const sz = sizes.map((s) => SIZE_LINKEDIN[s]).filter(Boolean);
        push('Companies', `Company pages · ${ind}${where}`, `site:linkedin.com/company/ ${q(term)}${L(loc)}${sz.length ? ' ' + orGroup(sz.slice(0, 3)) : ''}`, 'Find companies first, then search their leaders by name.');
        push('Signals', `Hiring for automation / ops · ${ind}${where}`, `(site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com) ("automation" OR "workflow" OR "operations engineer" OR "integration") ${q(term)}${L(loc)}`, 'Public job posts are strong timing signals.');
        push('Signals', `Funding, expansion, leadership news · ${ind}${where}`, `${q(term)}${L(loc)} ("raises" OR "Series A" OR "Series B" OR "expands" OR "appoints" OR "names new") -site:linkedin.com`, 'Use Tools → Past month in Google to keep it recent.');
      });
    });
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Opportunity identification                                          */
  /* ------------------------------------------------------------------ */

  // Ordered most-specific first. `fieldType` rules only fire when the
  // research field itself is of that type and nothing more specific matched.
  const RULES = [
    { id: 'automation', name: 'Automation build-out', re: /automat|\brpa\b|workflow|process engineer|integration engineer|low[- ]code|zapier|n8n|make\.com/i, service: /automation|workflow/i, topic: 'automation',
      challenge: 'Building automation capacity usually means a backlog of manual processes already exists, and hiring alone can be slower than that backlog grows.',
      problem: ['the backlog of manual workflows tends to grow faster than the team hired to clear it', 'the list of processes worth automating usually outruns the people available to automate them'],
      opportunity: 'Take one defined workflow off the backlog end-to-end so new hires start from working systems rather than a blank page.',
      value: ['taking one workflow off that list end-to-end, mapped, automated and handed over', 'owning one well-defined workflow from mapping to hand-over, so your team can stay on the core roadmap'] },
    { id: 'ai', name: 'AI adoption', re: /\bai\b|artificial intelligence|machine learning|\bml\b|\bllms?\b|gen ?ai|generative|copilot|data scien/i, service: /\bai\b/i, topic: 'AI rollout',
      challenge: 'Moving AI from interest to production typically stalls on data access, integration with existing systems and choosing the first use case.',
      problem: ['the hard part of AI is rarely the model; it is wiring it into the systems and data people already use', 'AI pilots tend to stall at the point where they need to plug into real workflows and data'],
      opportunity: 'Scope and ship one production AI use case attached to an existing workflow, with clear before/after measures.',
      value: ['scoping one AI use case that plugs into an existing workflow and getting it into production', 'picking a single AI use case tied to real manual effort and shipping it properly'] },
    { id: 'data', name: 'Reporting and data', re: /data engineer|analytics|reporting|dashboards?|\bbi\b|warehouse|snowflake|databricks|power bi|tableau/i, service: /data|technology|automation/i, topic: 'reporting',
      challenge: 'Reporting may depend on manual pulls across several systems, which slows decisions and ties up skilled people.',
      problem: ['reporting often ends up stitched together by hand from several systems', 'teams lose hours each week assembling numbers that could assemble themselves'],
      opportunity: 'Automate the data flow behind the reports the team already relies on.',
      value: ['automating the data flow behind the reports your team already uses', 'getting the recurring reports to build themselves from source systems'] },
    { id: 'sales', name: 'Sales and lead process', re: /sales ops|revops|revenue operations|\bcrm\b|salesforce|hubspot|lead (gen|routing|management)|pipeline|onboarding of clients|client onboarding|account opening/i, service: /lead|sales/i, topic: 'the sales and onboarding process',
      challenge: 'Lead handling, CRM updates and client onboarding often stay manual as teams grow, creating delays and data gaps.',
      problem: ['lead handling and CRM hygiene usually stay manual long after volume has outgrown them', 'onboarding and CRM steps tend to rely on people copying data between tools'],
      opportunity: 'Automate lead routing, CRM updates or client onboarding steps.',
      value: ['automating the hand-offs between lead capture, CRM and onboarding', 'removing the copy-paste steps between your sales tools'] },
    { id: 'migration', name: 'Systems migration', re: /migrat|legacy|moderni[sz]|re-?platform|cloud move|move to (aws|azure|gcp)|\berp\b|\bsap\b|netsuite|replac(e|ing) (their|its|the) /i, service: /technology|custom|digital/i, topic: 'the migration',
      challenge: 'Migrations tend to surface undocumented manual workarounds and integration gaps between old and new systems.',
      problem: ['migrations tend to surface the manual workarounds nobody documented', 'the integration gaps between old and new systems usually appear mid-migration'],
      opportunity: 'Map and rebuild the workflows and integrations around the migration so workarounds are not carried over.',
      value: ['mapping the workflows around the migration and rebuilding the integrations properly', 'making sure the manual workarounds do not get carried into the new stack'] },
    { id: 'compliance', name: 'Compliance workload', re: /complian|regulat|\baudit|\bkyc\b|\baml\b|\bsec\b|finra|hipaa|soc ?2|\bgdpr\b|reporting requirements/i, service: /process|automation/i, topic: 'compliance operations',
      challenge: 'Compliance work often relies on manual checks, spreadsheets and document handling, which scales poorly.',
      problem: ['compliance work tends to live in spreadsheets and inboxes, which scales badly', 'checks and evidence-gathering usually get done by hand until they become a bottleneck'],
      opportunity: 'Automate document intake, checks and audit trails while keeping people in the approval loop.',
      value: ['automating document intake and checks while keeping people on the approvals', 'building an audit trail that collects itself instead of being assembled by hand'] },
    { id: 'manual', name: 'Manual processes', re: /manual|spreadsheet|excel|paper|by hand|copy[- ]?paste|re-?keying|back[- ]office|email-based/i, service: /process|automation|efficiency/i, topic: 'manual processes',
      challenge: 'Visible manual steps suggest time is being spent on work that could be systemised.',
      problem: ['manual steps like these quietly absorb hours every week', 'spreadsheet-and-email processes usually hold up fine until volume grows'],
      opportunity: 'Replace the manual steps with an automated workflow, starting with the highest-volume one.',
      value: ['replacing the highest-volume manual step with an automated workflow', 'turning the most repetitive step into something that runs on its own'] },
    { id: 'transformation', name: 'Digital transformation', re: /digital transformation|transform|digiti[sz]/i, service: /digital|transformation/i, topic: 'the transformation programme',
      challenge: 'Transformation programmes often have more initiatives than delivery capacity.',
      problem: ['transformation programmes usually have more initiatives than delivery capacity', 'the roadmap is rarely the problem; delivery bandwidth is'],
      opportunity: 'Deliver a defined initiative within the programme alongside the internal team.',
      value: ['delivering one well-defined piece of the programme alongside your team', 'taking a self-contained initiative from plan to production'] },
    { id: 'funding', fieldType: 'funding', name: 'Post-funding scale-up', re: /rais|series [a-e]\b|\bseed\b|funding|investment|backed by|\bround\b/i, service: /efficiency|automation|process/i, topic: 'scaling after the raise',
      challenge: 'Post-funding growth targets put pressure on operations to scale without headcount growing at the same rate.',
      problem: ['the next stage of growth usually stresses operations before it stresses the product', 'after a raise, the processes that worked at the old size start to creak'],
      opportunity: 'Automate core operational workflows so growth does not require proportional hiring.',
      value: ['automating the operational workflows that would otherwise need extra headcount', 'helping operations scale with the plan without hiring at the same rate'] },
    { id: 'expansion', fieldType: 'expansion', name: 'Expansion', re: /expan|new office|new market|opening|opens|acqui|merg|entered|entering/i, service: /workflow|process|efficiency/i, topic: 'the expansion',
      challenge: 'Expansion multiplies process variations across locations or teams, which can create inconsistency and rework.',
      problem: ['expansion tends to multiply slightly different versions of the same process', 'each new location or team usually brings its own variation of core workflows'],
      opportunity: 'Standardise and automate core workflows across the expanded footprint.',
      value: ['standardising and automating the core workflows across the new footprint', 'getting one version of the key processes running everywhere'] },
    { id: 'leadership', fieldType: 'leadership', name: 'New leadership', re: /new (cto|cio|coo|ceo|cfo|head|vp|chief)|appoint|joins as|joined as|named|hired as|promoted/i, service: /technology|digital|workflow/i, topic: 'first-year priorities',
      challenge: 'New technology or operations leaders commonly review the stack and processes in their first months.',
      problem: ['new leaders often inherit a stack and process map that has not been reviewed in a while', 'the first months in a new role usually involve a hard look at systems and process'],
      opportunity: 'Offer an outside perspective: a short workflow review to support their early roadmap.',
      value: ['a short, practical review of where automation would save the most time', 'an outside view on which workflows are worth fixing first'] },
    { id: 'launch', fieldType: 'launch', name: 'Product launch', re: /launch|released|new product|introduc|rolled out|\bbeta\b|unveil/i, service: /automation|technology|operational/i, topic: 'the launch',
      challenge: 'New launches add support, onboarding and operational load around the product.',
      problem: ['launches usually add onboarding and support work that lands on the same team', 'the operational load around a launch tends to arrive faster than the processes for it'],
      opportunity: 'Automate the onboarding, support or ops workflows around the launch.',
      value: ['automating the onboarding and support workflows around the launch', 'putting the post-launch operational work on rails'] },
    { id: 'partnership', fieldType: 'partnership', name: 'Partnership integration', re: /partner|integrat|alliance|collaborat/i, service: /technology|custom|automation/i, topic: 'the partnership',
      challenge: 'New partnerships often require data exchange and integration work that competes with the core roadmap.',
      problem: ['partnerships usually come with integration work that competes with the core roadmap', 'partner data exchange often starts as a manual process'],
      opportunity: 'Build and automate the integration or data exchange behind the partnership.',
      value: ['building the integration and data exchange behind the partnership', 'taking the partner integration off your core team\'s plate'] },
    { id: 'opsHiring', fieldType: 'hiring', name: 'Operational hiring', re: /operations|ops (manager|analyst|associate)|coordinator|analyst|administrat|admin\b|support|customer success|associate|paraplanner/i, service: /efficiency|automation|process/i, topic: 'scaling operations',
      challenge: 'Hiring for operational roles can indicate a growing manual workload.',
      problem: ['operational hiring often signals manual workload growing with the business', 'ops roles tend to be added when repetitive work outgrows the current team'],
      opportunity: 'Automate the repetitive tasks those roles would otherwise absorb.',
      value: ['automating the repetitive tasks those roles would otherwise absorb', 'letting the new ops hires focus on judgement work instead of repetition'] },
    { id: 'engHiring', fieldType: 'hiring', name: 'Engineering capacity', re: /engineer|developer|devops|platform|architect|full[- ]?stack|backend|frontend/i, service: /custom|technology/i, topic: 'the engineering roadmap',
      challenge: 'Expanding engineering capacity suggests a roadmap that is larger than the current team.',
      problem: ['engineering roadmaps usually grow faster than hiring can keep up with', 'internal tools and integrations tend to get pushed behind product work'],
      opportunity: 'Take internal tooling or integration work off the core team so they stay on product.',
      value: ['taking internal tooling and integration work off the core team', 'delivering the internal tools that keep slipping behind product work'] },
    { id: 'complexity', name: 'Operational complexity', re: /multi|several systems|complex|at scale|scaling|growth|growing|hundreds|thousands|volume/i, service: /efficiency|workflow|process/i, topic: 'operational complexity',
      challenge: 'Growth in volume or system count typically increases hand-offs and manual coordination.',
      problem: ['growth tends to add hand-offs between systems faster than anyone removes them', 'more volume across more systems usually means more manual coordination'],
      opportunity: 'Reduce hand-offs by connecting the systems and automating the coordination steps.',
      value: ['connecting the systems and automating the coordination between them', 'cutting the manual hand-offs between tools'] }
  ];

  const FALLBACK = { id: 'context', name: 'Context only', topic: 'what you are working on', service: /technology/i,
    challenge: 'Not enough detail to infer a specific business challenge from this signal alone.',
    problem: ['it is hard to tell from the outside where the operational friction is'],
    opportunity: 'Validate in conversation before positioning any service.',
    value: ['a short conversation to see whether there is anything worth automating'] };

  function classify(field, text) {
    const type = FIELD[field] ? FIELD[field].type : '';
    const specific = RULES.filter((r) => !r.fieldType);
    // Strong tech/ops wording beats the field's own category.
    for (const r of specific.slice(0, 8)) if (r.re.test(text)) return { rule: r, strength: 2 };
    for (const r of RULES) if (r.fieldType && r.fieldType === type && r.re.test(text)) return { rule: r, strength: 2 };
    for (const r of RULES) if (r.fieldType && r.fieldType === type) return { rule: r, strength: 1 };
    for (const r of RULES) if (r.re.test(text)) return { rule: r, strength: 1 };
    return { rule: FALLBACK, strength: 0 };
  }

  function hiringText(roles) {
    return (roles || []).filter((r) => has(r.role)).map((r) => {
      const n = parseInt(r.count, 10);
      return (n > 1 ? n + ' ' : '') + clean(r.role) + (n > 1 && !/s$/i.test(clean(r.role)) ? 's' : '');
    }).join(', ');
  }

  function signalEntries(lead) {
    const r = lead.research || {};
    const out = [];
    SIGNAL_FIELDS.forEach((k) => {
      if (k === 'hiringRoles') {
        const t = hiringText(r.hiringRoles);
        if (t) out.push({ field: k, text: 'Hiring ' + t + ((r.hiringRoles.find((x) => has(x.source)) || {}).source ? ' (' + clean(r.hiringRoles.find((x) => has(x.source)).source) + ')' : '') });
      } else if (has(r[k])) out.push({ field: k, text: clean(r[k]) });
    });
    return out;
  }

  function matchService(settings, re) {
    const services = ((settings && settings.company && settings.company.services) || []).filter(has);
    return services.find((s) => re && re.test(s)) || services[0] || 'Automation';
  }

  function analyze(lead, settings) {
    const entries = signalEntries(lead);
    const types = new Set(entries.map((e) => (FIELD[e.field] || {}).type));
    const items = entries.map((e) => {
      const c = classify(e.field, e.text);
      let points = c.strength;
      if (/\d/.test(e.text) || /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\bq[1-4]\b|20\d\d/i.test(e.text)) points += 1;
      // Corroboration: a related signal elsewhere in the research.
      const corroborated = entries.some((o) => o !== e && classify(o.field, o.text).rule.id === c.rule.id);
      if (corroborated) points += 1;
      if (c.rule === FALLBACK) points = 0;
      const confidence = points >= 3 ? 'High' : points >= 2 ? 'Medium' : 'Low';
      const f = FIELD[e.field];
      return {
        id: e.field, field: e.field, fieldLabel: f.label, fieldType: f.type, ruleId: c.rule.id, ruleName: c.rule.name,
        topic: c.rule.topic, fact: e.text, challenge: c.rule.challenge, opportunity: c.rule.opportunity,
        service: matchService(settings, c.rule.service), confidence, points, corroborated, rule: c.rule
      };
    });
    const rank = { High: 3, Medium: 2, Low: 1 };
    const order = SIGNAL_FIELDS;
    items.sort((a, b) => (rank[b.confidence] - rank[a.confidence]) || (b.points - a.points) || (order.indexOf(a.field) - order.indexOf(b.field)));
    items.typesSeen = types;
    return items;
  }

  /* ------------------------------------------------------------------ */
  /* Lead scoring                                                        */
  /* ------------------------------------------------------------------ */

  function titleTier(title) {
    const t = clean(title).toLowerCase();
    if (!t) return { f: 0, why: 'No title entered' };
    if (/founder|\bceo\b|\bcto\b|\bcio\b|\bcoo\b|chief|president|owner|managing partner|managing director/.test(t)) return { f: 1, why: 'Founder / C-level decision maker' };
    if (/\bvp\b|vice president|head of|\bsvp\b|\bevp\b|partner/.test(t)) return { f: 0.8, why: 'VP / Head-of level' };
    if (/director/.test(t)) return { f: 0.6, why: 'Director level' };
    if (/manager|lead\b/.test(t)) return { f: 0.3, why: 'Manager level; may not own budget' };
    return { f: 0.15, why: 'Role seniority unclear' };
  }

  function locationMatch(loc, targets) {
    const L = clean(loc).toLowerCase();
    if (!L) return { f: 0, why: 'No location entered' };
    let best = { f: 0, why: 'Outside target locations' };
    (targets || []).forEach((t) => {
      const tt = typeof t === 'string' ? { custom: t } : t;
      const test = (v) => has(v) && L.includes(clean(v).toLowerCase());
      if (test(tt.custom) || test(tt.city)) best = best.f >= 1 ? best : { f: 1, why: 'In target city' };
      else if (test(tt.state) && best.f < 0.75) best = { f: 0.75, why: 'In target state / region' };
      else if ((test(tt.country) || (/united states|usa|\bus\b/i.test(tt.country || '') && /\b(usa|us|united states|ny|nj|ca|tx|ma)\b/i.test(L))) && best.f < 0.5) best = { f: 0.5, why: 'In target country' };
    });
    if (!(targets || []).length) best = { f: 1, why: 'No location restriction set' };
    return best;
  }

  function filledResearchCount(lead) {
    const r = lead.research || {};
    let n = 0;
    Object.keys(FIELD).forEach((k) => { if (k === 'hiringRoles') { if (hiringText(r.hiringRoles)) n++; } else if (has(r[k])) n++; });
    return n;
  }

  function scoreLead(lead, settings) {
    settings = settings || DEFAULT_SETTINGS;
    const w = Object.assign({}, DEFAULT_SETTINGS.scoring, settings.scoring || {});
    const icp = settings.icp || {};
    const r = lead.research || {};
    const parts = [];
    const add = (key, label, frac, why) => parts.push({ key, label, max: Number(w[key]) || 0, frac: Math.max(0, Math.min(1, frac)), why });

    const indOk = has(lead.industry) && (icp.industries || []).includes(lead.industry);
    const loc = locationMatch(lead.location, icp.locations);
    add('icp', 'ICP Fit', (indOk ? 0.6 : has(lead.industry) ? 0.1 : 0) + loc.f * 0.4,
      [indOk ? 'Target industry' : has(lead.industry) ? 'Industry not in ICP' : 'No industry', loc.why].join(' · '));

    const tier = titleTier(lead.title);
    const listed = (icp.titles || []).some((t) => clean(lead.title).toLowerCase().includes(clean(t).toLowerCase()));
    add('decision', 'Decision Maker Fit', Math.max(tier.f, listed ? 0.8 : 0), tier.why + (listed ? ' · Matches target title' : ''));

    const opps = analyze(lead, settings);
    const val = { High: 0.5, Medium: 0.3, Low: 0.1 };
    const oppF = opps.reduce((s, o) => s + val[o.confidence], 0);
    const hi = opps.filter((o) => o.confidence === 'High').length;
    add('opportunity', 'Opportunity Signal', oppF, opps.length ? `${opps.length} signal${opps.length > 1 ? 's' : ''}${hi ? `, ${hi} high confidence` : ''}` : 'No opportunity signals yet');

    const sizeOk = has(lead.companySize) && ((icp.sizes || []).length === 0 || icp.sizes.includes(lead.companySize));
    add('company', 'Company Fit', (sizeOk ? 0.6 : has(lead.companySize) ? 0.15 : 0) + (has(r.description) ? 0.2 : 0) + (has(r.products) ? 0.2 : 0),
      [sizeOk ? 'Target company size' : has(lead.companySize) ? 'Size outside ICP' : 'No company size', has(r.description) ? 'description' : 'no description', has(r.products) ? 'products known' : 'products unknown'].join(' · '));

    const n = filledResearchCount(lead);
    add('personalization', 'Personalization Data', n / 7, `${n} research field${n === 1 ? '' : 's'} filled`);

    const timing = SIGNAL_FIELDS.filter((k) => FIELD[k].timing && (k === 'hiringRoles' ? hiringText(r.hiringRoles) : has(r[k])));
    add('timing', 'Timing Signal', timing.length / 3, timing.length ? timing.map((k) => FIELD[k].label).join(', ') : 'No recent timing signal');

    const totalMax = parts.reduce((s, p) => s + p.max, 0) || 100;
    parts.forEach((p) => { p.score = Math.round(p.frac * p.max * 10) / 10; });
    const raw = parts.reduce((s, p) => s + p.frac * p.max, 0);
    const calculated = Math.round(raw * 100 / totalMax);
    const override = lead.scoreOverride === '' || lead.scoreOverride == null ? null : Math.max(0, Math.min(100, Number(lead.scoreOverride)));
    const total = override == null || isNaN(override) ? calculated : override;
    return { total, calculated, overridden: total !== calculated || override != null, parts, priority: priority(total) };
  }

  function priority(score) {
    if (score >= 80) return { label: 'High Priority', key: 'high' };
    if (score >= 60) return { label: 'Medium Priority', key: 'medium' };
    return { label: 'Low Priority', key: 'low' };
  }

  /* ------------------------------------------------------------------ */
  /* Outreach                                                            */
  /* ------------------------------------------------------------------ */

  function industryNoun(lead) {
    const i = clean(lead.industry);
    if (!i || i === 'Other') return 'teams';
    return (INDUSTRY_TERMS[i] ? INDUSTRY_TERMS[i][0] : i) + ' teams';
  }

  function materialFor(lead, settings, kinds) {
    const mats = (settings.materials || []).filter((m) => kinds.includes(m.kind) && has(m.title));
    const ind = clean(lead.industry).toLowerCase();
    return mats.find((m) => ind && clean(m.industry).toLowerCase() === ind) || null;
  }

  function sentences(list) { return list.filter(has).map((s) => clean(s)).join(' '); }

  function fitLength(build, minW, maxW) {
    // build(level): level 0 = full, higher = trimmed. Returns body text.
    let level = 0;
    let body = build(level);
    while (words(body) > maxW && level < 3) { level++; body = build(level); }
    return body;
  }

  function generateOutreach(lead, settings, opts) {
    settings = settings || DEFAULT_SETTINGS;
    opts = opts || {};
    const seed = opts.seed || 0;
    const opps = analyze(lead, settings);
    if (opts.primary) {
      const i = opps.findIndex((x) => x.field === opts.primary);
      if (i > 0) opps.unshift(opps.splice(i, 1)[0]);
    }
    if (!opps.length) {
      return { blocked: true, reason: 'There are no research signals for this lead yet. Add at least one verified observation in Research. The generator never invents one.' };
    }
    const o = opps[0];
    const second = opps.find((x) => x.ruleId !== o.ruleId && x.confidence !== 'Low');
    const company = clean(lead.company) || 'your company';
    const first = clean(lead.firstName) || 'there';
    const co = settings.company || {};
    const pv = clean(co.name) || 'Point Vision';
    const out = settings.outreach || DEFAULT_SETTINGS.outreach;
    const cta = pick((CTA_STYLES[out.ctaStyle] || CTA_STYLES.interest).lines, seed, 1);
    const fact = shortFact(o.fact);
    const f = FIELD[o.field];
    const hook = f.lead(company) + lcFirst(fact) + '.';
    const prob = pick(o.rule.problem, seed, 2);
    const val = pick(o.rule.value, seed, 3);
    const service = o.service;
    const nouns = industryNoun(lead);
    const insight = clean(lead.founderInsight);
    const proof = materialFor(lead, settings, ['case-study', 'client-result']);
    const proofLine = proof ? `We have done related work before (${clean(proof.title)}), happy to share the details.` : '';
    const sign = sign_(settings);

    const components = {
      hook,
      problem: `My guess is that ${prob}. That is a hypothesis, not something I can see from the outside.`,
      relevance: `${pv} works on ${lcService(service)} for ${nouns}.`,
      value: `The practical version: ${val}.`,
      cta
    };

    const secondLine = second ? `Also noticed: ${shortFact(second.fact, 16)}.` : '';
    const insightLine = insight ? (/[.!?]$/.test(insight) ? insight : insight + '.') : '';

    const A = fitLength((lvl) => sentences([
      `${first},`, '',
    ]) + '\n\n' + sentences([hook, `My read: ${prob}.`]) + '\n\n' + sentences([
      `${pv} helps with exactly that: ${val}.`, lvl < 1 ? insightLine : '', lvl < 2 ? proofLine : '', cta
    ]), out.minWords, out.maxWords);

    const B = fitLength((lvl) => `${first},\n\n` + sentences([
      `${f.lead(company)}${lcFirst(fact)}.`,
      `From a technical and operational angle, ${lcFirst(o.challenge)}`
    ]) + '\n\n' + sentences([
      lvl < 1 ? secondLine : '', lvl < 2 ? insightLine : '',
      `That is where ${pv} usually comes in: ${val}.`, lvl < 3 ? proofLine : ''
    ]) + '\n\n' + cta, out.minWords, out.maxWords);

    const intro = has(co.senderName) ? `I'm ${clean(co.senderName)}, ${clean(co.senderRole || 'founder').toLowerCase()} of ${pv}.` : `I run ${pv}.`;
    const C = fitLength((lvl) => `Hi ${first},\n\n` + sentences([
      hook, `My hunch is that ${prob}, though you would know better than me.`
    ]) + '\n\n' + sentences([
      intro, `We work with ${nouns} on ${lcService(service)}. A typical first step is ${val}.`,
      lvl < 1 ? secondLine : '', lvl < 2 ? insightLine : '', lvl < 3 ? proofLine : ''
    ]) + '\n\n' + `No pitch deck. ${cta}`, out.minWords, out.maxWords);

    const topic = o.topic.replace(/^the /, '');
    const mk = (body, subject) => {
      const full = body + (sign ? '\n\n' + sign : '');
      return { subject, body: full, words: words(body) };
    };
    const variants = {
      A: mk(A, `${company} + ${topic}`),
      B: mk(B, `${topic} at ${company}`),
      C: mk(C, `${first}, a thought on ${topic}`)
    };
    // Pad any variant that came out short with the second signal, if we have one.
    Object.keys(variants).forEach((k) => {
      const v = variants[k];
      if (v.words < out.minWords && second && !v.body.includes(shortFact(second.fact, 16))) {
        const body = v.body.replace(cta, `${secondLine} ${cta}`);
        variants[k] = { subject: v.subject, body, words: words(sign ? body.replace(sign, '') : body) };
      }
      // Still short: add one of the team's own value propositions from Settings.
      const vps = (co.valueProps || []).filter(has);
      for (let i = 0; variants[k].words < out.minWords && i < vps.length; i++) {
        const cur = variants[k];
        const line = `How we work: ${lcFirst(clean(vps[(i + seed) % vps.length]).replace(/[.!?]$/, ''))}.`;
        if (cur.body.includes(line)) continue;
        const body = cur.body.replace(cta, `${line} ${cta}`);
        variants[k] = { subject: cur.subject, body, words: words(sign ? body.replace(sign, '') : body) };
      }
    });
    return { blocked: false, components, variants, primary: stripRule(o), secondary: second ? stripRule(second) : null, angle: o.field, signal: o.ruleId, seed, generatedAt: new Date().toISOString() };
  }

  function stripRule(o) { const c = Object.assign({}, o); delete c.rule; return c; }

  function sign_(settings) {
    const co = settings.company || {};
    if (has(co.signature)) return String(co.signature).trim();
    if (has(co.senderName)) return clean(co.senderName) + '\n' + (clean(co.senderRole) ? clean(co.senderRole) + ', ' : '') + (clean(co.name) || 'Point Vision');
    return '';
  }

  // Source text the outreach is allowed to draw facts from.
  function sourceText(lead, settings) {
    const r = lead.research || {};
    const parts = [lead.firstName, lead.lastName, lead.company, lead.title, lead.industry, lead.location, lead.companySize, lead.founderInsight, hiringText(r.hiringRoles)];
    Object.keys(r).forEach((k) => { if (typeof r[k] === 'string') parts.push(r[k]); });
    (r.hiringRoles || []).forEach((h) => parts.push(h.role, h.count, h.source));
    const co = (settings && settings.company) || {};
    Object.keys(CTA_STYLES).forEach((k) => parts.push(CTA_STYLES[k].lines.join(' ')));
    parts.push(co.description, co.signature, (co.services || []).join(' '), (co.valueProps || []).join(' '));
    ((settings && settings.materials) || []).forEach((m) => parts.push(m.title, m.content));
    return parts.filter(has).join(' \n ');
  }

  function lintEmail(text, lead, settings) {
    settings = settings || DEFAULT_SETTINGS;
    const out = settings.outreach || DEFAULT_SETTINGS.outreach;
    const sign = sign_(settings);
    const body = sign ? String(text || '').replace(sign, '') : String(text || '');
    const issues = [];
    const lower = body.toLowerCase();
    (out.avoidPhrases || DEFAULT_AVOID).forEach((p) => {
      if (has(p) && lower.includes(p.toLowerCase())) issues.push({ level: 'warn', text: `Avoid “${p}”.` });
    });
    const n = words(body);
    if (n < (out.minWords || 60)) issues.push({ level: 'warn', text: `${n} words: below the ${out.minWords || 60}-word minimum.` });
    if (n > (out.maxWords || 120)) issues.push({ level: 'warn', text: `${n} words: above the ${out.maxWords || 120}-word maximum.` });
    if (lead) {
      const src = sourceText(lead, settings).toLowerCase();
      const nums = body.match(/[$£€₹]?\d[\d,.]*\s?(%|x|k|m|bn|million|billion)?/gi) || [];
      nums.forEach((num) => {
        const core = num.replace(/[^\d.]/g, '').replace(/\.$/, '');
        if (core && !src.includes(core)) issues.push({ level: 'error', text: `“${num.trim()}” does not appear anywhere in the research. Verify it or remove it.` });
      });
      const paras = body.split(/\n\s*\n/).map(clean).filter(has);
      const opening = paras.find((p) => !/^(hi|hello|hey|dear)?\s*[\w'-]+,$/i.test(p)) || '';
      const firstSentence = (opening.match(/^.+?[.!?](\s|$)/) || [opening])[0].toLowerCase();
      const facts = signalEntries(lead).map((e) => shortFact(e.text, 8).toLowerCase().replace(/…$/, ''));
      const specific = facts.some((f) => f && firstSentence.includes(f.slice(0, 18))) || (has(lead.company) && firstSentence.includes(clean(lead.company).toLowerCase()));
      if (!specific) issues.push({ level: 'warn', text: 'The opening sentence should contain a specific observation from the research.' });
    }
    return { words: n, issues, ok: !issues.some((i) => i.level === 'error') };
  }

  /* ------------------------------------------------------------------ */
  /* LinkedIn and follow-ups                                             */
  /* ------------------------------------------------------------------ */

  function linkedinPlan(lead, settings) {
    const opps = analyze(lead, settings);
    const o = opps[0];
    const first = clean(lead.firstName) || 'there';
    const company = clean(lead.company) || 'your company';
    const topic = o ? o.topic : null;
    const f = o ? FIELD[o.field] : null;
    const personal = f && f.type === 'personal';
    const note = !o ? `Hi ${first}, would be good to connect.`
      : personal ? `Hi ${first}, enjoyed your ${f.noun}. Would be good to connect.`
        : `Hi ${first}, enjoyed reading about ${company} recently. Would be good to connect.`;
    return {
      recommended: 'Send a simple connection request. No pitch, no link. A blank request is fine; the short note below is optional.',
      note,
      afterAccept: o ? {
        firstFollowUp: `Thanks for connecting, ${first}. ${personal ? 'Your ' + f.noun : 'The ' + f.noun + ' at ' + company} caught my eye: ${lcFirst(shortFact(o.fact, 16))}. Curious how it is going on your side.`,
        conversationStarter: `Out of interest, how are you thinking about ${topic} at ${company} over the next few months?`,
        valueFollowUp: `One pattern we often see around ${topic}: ${lcFirst(o.challenge)} If useful, happy to share a few notes on how teams have approached it. No pitch.`
      } : {
        firstFollowUp: `Thanks for connecting, ${first}.`,
        conversationStarter: 'Add research first. Conversation starters are generated from verified signals only.',
        valueFollowUp: 'Add research first. Value-led follow-ups are generated from verified signals only.'
      }
    };
  }

  function followUpPlan(lead, settings) {
    settings = settings || DEFAULT_SETTINGS;
    const days = ((settings.outreach && settings.outreach.followUpDays) || [3, 7, 14]).slice(0, 3);
    const sent = lead.milestones && lead.milestones.sent;
    const opps = analyze(lead, settings);
    const o = opps[0];
    const first = clean(lead.firstName) || 'there';
    const company = clean(lead.company) || 'your team';
    const sign = sign_(settings);
    const cta = pick((CTA_STYLES[(settings.outreach || {}).ctaStyle] || CTA_STYLES.interest).lines, 0, 2);
    const subj = lead.outreach && lead.outreach.subject ? 'Re: ' + lead.outreach.subject : `Following up: ${company}`;
    const S = (b) => b + (sign ? '\n\n' + sign : '');
    const bodies = o ? [
      `Hi ${first},\n\nBumping this in case it got buried. What prompted my note was the ${FIELD[o.field].noun} at ${company}: ${lcFirst(shortFact(o.fact, 18))}.\n\n${cta}`,
      `Hi ${first},\n\nOne more thought on ${o.topic}. ${o.challenge.replace(/^([A-Z])/, (m) => m)}\n\nWhere we would start: ${lcFirst(o.opportunity)} If useful, I can send a short outline, no call needed.`,
      `Hi ${first},\n\nI haven't heard back, so I'll assume the timing isn't right and close the loop here. If ${o.topic} moves up the list at ${company}, I'm easy to find.\n\nWishing you and the team a strong quarter.`
    ] : [
      `Hi ${first},\n\nBumping my earlier note in case it got buried.\n\n${cta}`,
      `Hi ${first},\n\nAdd research to this lead to generate an insight-led follow-up.`,
      `Hi ${first},\n\nI'll close the loop here. If the timing changes, I'm easy to find.`
    ];
    const labels = ['Short reminder + original observation', 'Useful insight + potential opportunity', 'Polite close-the-loop'];
    return days.map((d, i) => {
      const done = lead.followups && lead.followups[i + 1];
      return {
        n: i + 1, day: Number(d), label: labels[i], subject: subj, body: S(bodies[i]),
        due: sent ? dayKey(addDays(new Date(sent), Number(d))) : null,
        doneAt: done && done.doneAt ? done.doneAt : null, skipped: !!(done && done.skipped)
      };
    });
  }

  const STOP_FOLLOWUPS = ['replied', 'positive', 'meeting', 'qualified', 'proposal', 'won', 'lost', 'notInterested'];

  function nextFollowUp(lead, settings) {
    if (!lead.milestones || !lead.milestones.sent) return null;
    if (STOP_FOLLOWUPS.includes(lead.status) || (lead.milestones.replied)) return null;
    return followUpPlan(lead, settings).find((f) => !f.doneAt && !f.skipped) || null;
  }

  /* ------------------------------------------------------------------ */
  /* Status helpers                                                      */
  /* ------------------------------------------------------------------ */

  function researchStatus(lead) {
    if (lead.milestones && lead.milestones.researched) return 'Complete';
    return filledResearchCount(lead) > 0 ? 'In progress' : 'Not started';
  }

  function linkedinStatus(lead) {
    const c = lead.linkedinChecklist || {};
    if (c.replied) return 'Replied';
    if (c.connected || (lead.milestones || {}).connected) return 'Connected';
    if (c.requestSent) return 'Requested';
    return 'Not requested';
  }

  function missingCore(lead) {
    const req = { firstName: 'First name', lastName: 'Last name', title: 'Job title', company: 'Company', linkedin: 'LinkedIn URL', industry: 'Industry', location: 'Location' };
    return Object.keys(req).filter((k) => !has(lead[k])).map((k) => req[k]);
  }

  function nextStep(lead) {
    if (lead.founderNote && ['researching', 'researchComplete', 'drafted', 'new'].includes(lead.status) && !lead.founderNoteResolved) return { key: 'fix', label: 'Fix founder feedback', view: 'research' };
    if (missingCore(lead).length) return { key: 'details', label: 'Complete details', view: 'edit' };
    if (['new', 'researching'].includes(lead.status)) return { key: 'research', label: 'Research company', view: 'research' };
    if (!has(lead.email) || lead.emailStatus === 'Unverified') return { key: 'email', label: has(lead.email) ? 'Verify email' : 'Find email', view: 'edit' };
    if (lead.status === 'researchComplete') return { key: 'draft', label: 'Generate email', view: 'email' };
    if (lead.status === 'drafted') return { key: 'submit', label: 'Submit for review', view: 'email' };
    if (lead.status === 'review') return { key: 'founder', label: 'Waiting for founder', view: 'review' };
    if (lead.status === 'approved') return { key: 'send', label: 'Send manually', view: 'lead' };
    return { key: 'track', label: 'Track response', view: 'lead' };
  }

  /* ------------------------------------------------------------------ */
  /* Metrics                                                             */
  /* ------------------------------------------------------------------ */

  function reached(lead, m) {
    const ms = lead.milestones || {};
    if (ms[m]) return true;
    return (IMPLIED_BY[m] || []).some((k) => ms[k]);
  }

  function inRange(iso, from, to) {
    if (!iso) return false;
    const k = dayKey(iso);
    return k >= from && k <= to;
  }

  const ACTIVITY = [
    ['added', 'Prospects Added'], ['researched', 'Research Completed'], ['drafted', 'Emails Drafted'],
    ['approved', 'Emails Approved'], ['sent', 'Emails Sent'], ['linkedinRequested', 'LinkedIn Requests'],
    ['replied', 'Replies'], ['positive', 'Positive Replies'], ['meeting', 'Meetings Booked']
  ];

  function activity(leads, from, to) {
    to = to || from;
    const res = {};
    ACTIVITY.forEach(([k]) => { res[k] = 0; });
    ['submitted', 'verified', 'connected', 'qualified', 'proposal', 'won', 'lost', 'notInterested'].forEach((k) => { res[k] = 0; });
    (leads || []).forEach((l) => {
      Object.keys(res).forEach((k) => { if (inRange((l.milestones || {})[k], from, to)) res[k]++; });
    });
    return res;
  }

  const CONVERSIONS = [
    ['Lead → Email', 'added', 'sent'], ['Email → Reply', 'sent', 'replied'], ['Reply → Positive Reply', 'replied', 'positive'],
    ['Positive Reply → Meeting', 'positive', 'meeting'], ['Meeting → Opportunity', 'meeting', 'qualified'], ['Opportunity → Client', 'qualified', 'won']
  ];

  function conversions(leads) {
    return CONVERSIONS.map(([label, a, b]) => {
      const base = (leads || []).filter((l) => reached(l, a));
      const hit = base.filter((l) => reached(l, b));
      return { label, from: a, to: b, num: hit.length, den: base.length, pct: base.length ? Math.round(hit.length * 1000 / base.length) / 10 : null };
    });
  }

  function bestBy(leads, keyFn, labelFn) {
    const groups = {};
    leads.forEach((l) => {
      const k = keyFn(l);
      if (!has(k)) return;
      const g = groups[k] = groups[k] || { key: k, label: labelFn ? labelFn(k) : k, sent: 0, replied: 0, positive: 0 };
      g.sent++;
      if (reached(l, 'replied')) g.replied++;
      if (reached(l, 'positive')) g.positive++;
    });
    const list = Object.values(groups).map((g) => Object.assign(g, {
      replyRate: g.sent ? g.replied / g.sent : 0, positiveRate: g.sent ? g.positive / g.sent : 0
    }));
    list.sort((a, b) => (b.positiveRate - a.positiveRate) || (b.replyRate - a.replyRate) || (b.sent - a.sent));
    const top = list.find((g) => g.replied > 0) || null;
    return { top, all: list };
  }

  function weeklyReport(leads, weekStartDate, settings, scope) {
    const ws = startOfWeek(weekStartDate || new Date());
    const from = dayKey(ws);
    const to = dayKey(addDays(ws, 6));
    const counts = activity(leads, from, to);
    const totals = {
      researched: counts.researched, sent: counts.sent, connected: counts.connected, replies: counts.replied,
      positive: counts.positive, meetings: counts.meeting, qualified: counts.qualified, proposals: counts.proposal, won: counts.won, added: counts.added
    };
    // Performance insights look at leads emailed in the period (or all time).
    const pool = (leads || []).filter((l) => (l.milestones || {}).sent && (scope === 'all' || inRange(l.milestones.sent, from, to)));
    const stage = (k) => (FIELD[k] ? FIELD[k].label : k);
    const ruleName = (id) => (RULES.find((r) => r.id === id) || FALLBACK).name;
    const titleGroup = (t) => {
      const s = clean(t).toLowerCase();
      if (/founder/.test(s)) return 'Founder / Co-Founder';
      if (/\bceo\b/.test(s)) return 'CEO';
      if (/\bcto\b/.test(s)) return 'CTO';
      if (/\bcio\b/.test(s)) return 'CIO';
      if (/\bcoo\b/.test(s)) return 'COO';
      if (/\bvp\b|vice president/.test(s)) return 'VP';
      if (/head of/.test(s)) return 'Head of';
      return clean(t) || '';
    };
    const researchedPool = (leads || []).filter((l) => (l.milestones || {}).researched && (scope === 'all' || inRange(l.milestones.researched, from, to)));
    const pain = {};
    researchedPool.forEach((l) => {
      const seen = new Set();
      analyze(l, settings).forEach((o) => { if (o.ruleId !== 'context' && !seen.has(o.ruleId)) { seen.add(o.ruleId); pain[o.ruleId] = (pain[o.ruleId] || 0) + 1; } });
    });
    const painTop = Object.keys(pain).sort((a, b) => pain[b] - pain[a])[0];
    return {
      from, to, totals, sample: pool.length,
      insights: {
        industry: bestBy(pool, (l) => l.industry),
        title: bestBy(pool, (l) => titleGroup(l.title)),
        angle: bestBy(pool, (l) => l.outreach && l.outreach.angle, stage),
        signal: bestBy(pool, (l) => l.outreach && l.outreach.signal, ruleName),
        variation: bestBy(pool, (l) => l.outreach && l.outreach.variant, (k) => ({ A: 'Version A: Direct', B: 'Version B: Insight-led', C: 'Version C: Founder-to-founder' }[k] || k)),
        pain: painTop ? { name: ruleName(painTop), count: pain[painTop], of: researchedPool.length, challenge: (RULES.find((r) => r.id === painTop) || FALLBACK).challenge } : null
      }
    };
  }

  function toCSV(rows) {
    return rows.map((r) => r.map((v) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\n');
  }

  return {
    INDUSTRIES, TITLES, SIZES, EMAIL_STATUSES, EMAIL_SOURCES, STAGES, STAGE_BY_KEY, CTA_STYLES, DEFAULT_AVOID,
    DEFAULT_SETTINGS, RESEARCH, FIELD, SIGNAL_FIELDS, RULES, ACTIVITY, CONVERSIONS, STOP_FOLLOWUPS,
    clean, has, words, uid, dayKey, addDays, startOfWeek, shortFact, fullName, hiringText,
    newLead, emptyResearch, normLinkedIn, normCompany, findDuplicates, buildQueries, analyze, signalEntries,
    scoreLead, priority, generateOutreach, lintEmail, sourceText, linkedinPlan, followUpPlan, nextFollowUp,
    researchStatus, linkedinStatus, missingCore, nextStep, filledResearchCount,
    reached, activity, conversions, weeklyReport, toCSV
  };
});
