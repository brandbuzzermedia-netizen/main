/* Sample leads so the workflow can be demonstrated straight away.
   Every person and company here is fictional. Emails use the reserved
   .example domain so nothing can ever be sent to a real inbox. Each lead
   carries `sample: true` and can be cleared from Settings → Data. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PVSeed = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // [status, daysAgoAdded, extra]
  const L = [
    // ---- Today's batch -------------------------------------------------
    { s: 'review', d: 0, v: 'C', f: 'Maya', l: 'Chen', t: 'CTO', c: 'Harborline Wealth Partners', ind: 'Wealth Management', loc: 'New York, NY, United States', size: '51–200', es: 'Valid', src: 'Pattern + verifier',
      r: { description: 'Independent RIA serving high-net-worth families across the Northeast, about $4B in assets under advisement.', products: 'Financial planning, investment management, family office services.',
        hiring: 'Hiring 2 automation engineers and a "Client Onboarding Operations Lead" (company careers page, posted Sept 2026).',
        hiringRoles: [{ role: 'Automation Engineer', count: '2', source: 'Careers page, Sept 2026' }],
        stack: 'Job posts mention Salesforce Financial Services Cloud, Orion and "Excel-based reconciliation".',
        complexity: 'Client onboarding described in the job post as "a 30-step process across 4 systems".',
        linkedinActivity: 'Posted on LinkedIn (Sept 2026) that "the next 18 months are about removing manual work from onboarding".' } },
    { s: 'review', d: 0, v: 'B', f: 'Daniel', l: 'Okafor', t: 'Co-Founder & CEO', c: 'Ledgerly', ind: 'FinTech', loc: 'Brooklyn, New York, United States', size: '11–50', es: 'Valid', src: 'Company website',
      r: { description: 'Accounts-payable automation for mid-market construction firms.', products: 'AP inbox, invoice matching, lien waiver tracking.',
        funding: 'Raised a $9M Series A led by a NYC seed fund (press release, Aug 2026).',
        hiring: 'Hiring a Head of Customer Operations and 2 Implementation Specialists.',
        hiringRoles: [{ role: 'Implementation Specialist', count: '2', source: 'Wellfound, Sept 2026' }],
        interviews: 'Podcast interview: said customer implementations "still take 6 weeks of spreadsheet mapping".' } },
    { s: 'review', d: 0, v: 'A', f: 'Priya', l: 'Raman', t: 'VP Engineering', c: 'Northwind Analytics', ind: 'SaaS', loc: 'New York, NY, United States', size: '51–200', es: 'Risky', src: 'Hunter (free tier)',
      r: { description: 'Revenue analytics platform for B2B subscription businesses.', products: 'Churn forecasting, revenue dashboards.',
        launch: 'Launched an AI forecasting assistant in beta (product blog, Sept 2026).',
        engHiring: 'Hiring 3 backend engineers and an ML engineer to "productionise LLM features".',
        articles: 'Wrote a blog post on why most AI features stall between demo and production.' } },
    { s: 'drafted', d: 0, v: 'A', f: 'Marcus', l: 'Bell', t: 'COO', c: 'Crescent Lane Advisors', ind: 'Wealth Management', loc: 'New York, NY, United States', size: '11–50', es: 'Valid', src: 'Company website',
      r: { description: 'Boutique wealth manager for founders and tech employees.', products: 'Equity compensation planning, tax-aware investing.',
        expansion: 'Opened a second office in Austin (LinkedIn company post, Aug 2026).',
        complexity: 'Website says each client gets a "custom quarterly report", which suggests a manual reporting process.' } },
    { s: 'researchComplete', d: 0, f: 'Elena', l: 'Vasquez', t: 'Head of Operations', c: 'Parkside Realty Group', ind: 'Real Estate', loc: 'New York, NY, United States', size: '201–500', es: 'Valid', src: 'Pattern + verifier',
      r: { description: 'Residential property manager with roughly 9,000 units across NYC.', products: 'Property management, leasing, maintenance.',
        techChanges: 'Migrating from Yardi to a new property platform (job post for "Migration Project Manager").',
        hiring: 'Hiring 4 leasing coordinators.', hiringRoles: [{ role: 'Leasing Coordinator', count: '4', source: 'Indeed, Sept 2026' }] } },
    { s: 'researching', d: 0, f: 'Tom', l: 'Ashford', t: 'CIO', c: 'Meridian Capital Advisors', ind: 'Financial Services', loc: 'Stamford, Connecticut, United States', size: '201–500', es: 'Unverified', src: 'Pattern + verifier', em: 'tom.ashford@meridian-capital.example',
      r: { description: 'Alternative asset manager focused on private credit.', news: 'Press release: preparing for new SEC private fund reporting requirements in 2027.' } },
    { s: 'researching', d: 0, f: 'Grace', l: 'Liu', t: 'Founder', c: 'Brightwell Health Billing', ind: 'Healthcare', loc: 'Jersey City, New Jersey, United States', size: '11–50', es: 'Unverified', src: '', em: '',
      r: { description: 'Medical billing outsourcing for independent clinics.' } },
    { s: 'new', d: 0, f: 'Samuel', l: 'Ortiz', t: 'Head of Technology', c: 'Atlas Freight Systems', ind: 'Logistics', loc: 'Newark, New Jersey, United States', size: '51–200', es: 'Unverified', src: '', em: '', r: {} },
    { s: 'new', d: 0, f: 'Hannah', l: 'Kim', t: 'CEO', c: 'Copperleaf Commerce', ind: 'E-commerce', loc: 'New York, NY, United States', size: '11–50', es: 'Unverified', src: '', em: '', r: {} },

    // ---- Earlier this week / last week --------------------------------
    { s: 'approved', d: 1, v: 'B', ready: true, f: 'Ravi', l: 'Menon', t: 'CTO', c: 'Clearpath Payments', ind: 'FinTech', loc: 'New York, NY, United States', size: '51–200', es: 'Valid', src: 'Company website',
      r: { description: 'Payment orchestration for online marketplaces.', products: 'Payouts, split payments, compliance tooling.',
        partnerships: 'Announced a partnership with a European acquirer to support EU payouts (Sept 2026).',
        hiring: 'Hiring a "Compliance Automation Engineer" to automate KYC reviews.',
        hiringRoles: [{ role: 'Compliance Automation Engineer', count: '1', source: 'Greenhouse, Sept 2026' }] } },
    { s: 'sent', d: 2, sent: 1, v: 'C', f: 'Olivia', l: 'Grant', t: 'Co-Founder', c: 'Fieldstone Family Office', ind: 'Wealth Management', loc: 'New York, NY, United States', size: '11–50', es: 'Valid', src: 'Pattern + verifier',
      r: { description: 'Multi-family office for three founding families.', leadership: 'Appointed a new COO from a large private bank (LinkedIn announcement, Sept 2026).',
        complexity: 'Reporting across custodians is described on their site as "consolidated by our team every month".' } },
    { s: 'sent', d: 5, sent: 3, v: 'A', li: { requestSent: true, profileReviewed: true }, f: 'Jonah', l: 'Weiss', t: 'VP Technology', c: 'Summit Ridge Insurance Services', ind: 'Financial Services', loc: 'New York, NY, United States', size: '201–500', es: 'Valid', src: 'Apollo (free tier)',
      r: { description: 'Commercial insurance broker for mid-sized businesses.', transformation: 'Running a "digital broker" transformation programme announced in Q2 2026.',
        stack: 'Uses Applied Epic; job posts mention "manual certificate issuance".' } },
    { s: 'connected', d: 9, sent: 7, v: 'B', fu: [1], li: { requestSent: true, profileReviewed: true, connected: true }, f: 'Aisha', l: 'Patel', t: 'Head of Digital Transformation', c: 'Greystone Property Management', ind: 'Real Estate', loc: 'Hoboken, New Jersey, United States', size: '201–500', es: 'Valid', src: 'Company website',
      r: { description: 'Commercial property manager across the NY metro area.', transformation: 'Leading a programme to digitise tenant onboarding (LinkedIn post, Aug 2026).',
        automation: 'Tenant certificates of insurance are collected and checked by email.' } },
    { s: 'replied', d: 10, sent: 8, rep: 6, v: 'C', li: { requestSent: true, profileReviewed: true }, f: 'Ben', l: 'Hartley', t: 'Founder & CEO', c: 'Tidewater Logistics', ind: 'Logistics', loc: 'Elizabeth, New Jersey, United States', size: '51–200', es: 'Valid', src: 'Pattern + verifier',
      r: { description: '3PL warehousing for e-commerce brands.', expansion: 'Opened a second 120,000 sq ft warehouse in Pennsylvania (Aug 2026).', hiring: 'Hiring 6 warehouse operations associates.' } },

    // ---- Older: deeper in the funnel ----------------------------------
    { s: 'positive', d: 16, sent: 14, rep: 12, v: 'B', li: { requestSent: true, profileReviewed: true, connected: true, replied: true }, f: 'Sofia', l: 'Romero', t: 'CTO', c: 'Lumen Lending', ind: 'FinTech', loc: 'New York, NY, United States', size: '51–200', es: 'Valid', src: 'Company website',
      r: { description: 'Small-business lending platform.', funding: 'Raised a $22M Series B (Aug 2026).', engHiring: 'Hiring 2 data engineers to rebuild underwriting reporting.' } },
    { s: 'meeting', d: 20, sent: 18, rep: 16, mt: 14, v: 'C', li: { requestSent: true, profileReviewed: true, connected: true, replied: true }, f: 'Arjun', l: 'Shah', t: 'COO', c: 'Beacon Street Wealth', ind: 'Wealth Management', loc: 'New York, NY, United States', size: '51–200', es: 'Valid', src: 'Pattern + verifier',
      r: { description: 'Wealth management for physicians.', complexity: 'Onboarding requires collecting documents by email and re-keying them into the CRM.', hiring: 'Hiring 2 client service associates.' } },
    { s: 'qualified', d: 27, sent: 25, rep: 23, mt: 20, q: 19, v: 'A', li: { requestSent: true, profileReviewed: true, connected: true }, f: 'Chloe', l: 'Dubois', t: 'VP Engineering', c: 'Gridline Software', ind: 'SaaS', loc: 'New York, NY, United States', size: '51–200', es: 'Valid', src: 'Company website',
      r: { description: 'Field-service scheduling software.', launch: 'Launched an AI dispatch assistant (July 2026).', engHiring: 'Hiring an ML engineer and 2 platform engineers.' } },
    { s: 'proposal', d: 33, sent: 31, rep: 29, mt: 26, q: 24, pr: 21, v: 'B', li: { requestSent: true, profileReviewed: true, connected: true, replied: true }, f: 'Noah', l: 'Fischer', t: 'Head of Operations', c: 'Keystone Advisory Group', ind: 'Professional Services', loc: 'New York, NY, United States', size: '201–500', es: 'Valid', src: 'Pattern + verifier',
      r: { description: 'Tax and advisory firm for mid-market companies.', complexity: 'Client document collection runs on email and shared spreadsheets (careers page).', transformation: 'Partner interview mentions a 2026 "practice modernisation" initiative.' } },
    { s: 'won', d: 45, sent: 43, rep: 41, mt: 38, q: 36, pr: 33, w: 26, v: 'C', li: { requestSent: true, profileReviewed: true, connected: true, replied: true }, f: 'Isabel', l: 'Moreno', t: 'Founder', c: 'Saltmarsh Financial Planning', ind: 'Wealth Management', loc: 'New York, NY, United States', size: '11–50', es: 'Valid', src: 'Company website',
      r: { description: 'Fee-only financial planning firm.', hiring: 'Hiring a paraplanner to handle "a growing volume of client paperwork".', automation: 'Client meeting notes are typed up manually after every review.' } },
    { s: 'notInterested', d: 12, sent: 10, rep: 9, v: 'A', f: 'Peter', l: 'Novak', t: 'CTO', c: 'Oakbridge Securities', ind: 'Financial Services', loc: 'New York, NY, United States', size: '201–500', es: 'Valid', src: 'Apollo (free tier)',
      r: { description: 'Broker-dealer for independent advisors.', news: 'Announced a move of trading infrastructure to AWS (June 2026).' } },
    { s: 'lost', d: 40, sent: 38, rep: 35, mt: 32, v: 'B', f: 'Leah', l: 'Goldberg', t: 'CEO', c: 'Pinecrest Learning', ind: 'Education', loc: 'New York, NY, United States', size: '51–200', es: 'Valid', src: 'Company website',
      r: { description: 'Online test-prep for professional certifications.', launch: 'Launched a CFA prep course (May 2026).', hiring: 'Hiring 3 student support coordinators.' } }
  ];

  function build(E, settings, now) {
    now = now || new Date();
    const at = (daysAgo, hour) => { const d = new Date(now); d.setDate(d.getDate() - daysAgo); d.setHours(hour || 10, Math.floor(Math.random() * 50), 0, 0); if (d > now) d.setTime(now.getTime() - 60000 * (5 + Math.random() * 30)); return d.toISOString(); };
    return L.map((x, i) => {
      const slug = (x.f + '-' + x.l).toLowerCase();
      const domain = x.c.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '') + '.example';
      const lead = E.newLead({
        firstName: x.f, lastName: x.l, title: x.t, company: x.c, website: 'https://' + domain, linkedin: 'https://www.linkedin.com/in/pv-sample-' + slug,
        location: x.loc, industry: x.ind, companySize: x.size,
        email: x.em !== undefined ? x.em : x.f.toLowerCase() + '@' + domain,
        emailSource: x.src || '', emailStatus: x.es, status: x.s, sample: true
      }, new Date(at(x.d, 9)));
      Object.assign(lead.research, x.r);
      lead.research.hiringRoles = x.r.hiringRoles || [];
      lead.research.sources = Object.keys(x.r).length ? 'Company website; careers page; LinkedIn company page' : '';
      const ms = lead.milestones;
      const stageIdx = E.STAGE_BY_KEY[x.s].index;
      const pastResearch = stageIdx >= E.STAGE_BY_KEY.researchComplete.index;
      if (x.es && x.es !== 'Unverified') ms.verified = at(x.d, 10);
      if (stageIdx >= 1) ms.researchStarted = at(x.d, 10);
      if (pastResearch) ms.researched = at(x.d, 11);
      if (x.v) {
        const gen = E.generateOutreach(lead, settings, { seed: i });
        if (!gen.blocked) {
          const v = gen.variants[x.v];
          lead.outreach = { variants: gen.variants, components: gen.components, variant: x.v, subject: v.subject, body: v.body, angle: gen.angle, signal: gen.signal, seed: i, generatedAt: at(x.d, 12), readyToSend: !!x.ready };
          ms.drafted = at(x.d, 12);
        }
      }
      if (stageIdx >= E.STAGE_BY_KEY.review.index) ms.submitted = at(x.d, 13);
      if (stageIdx >= E.STAGE_BY_KEY.approved.index) ms.approved = at(Math.max(x.d - 1, x.sent || 0), 9);
      if (x.sent != null) { ms.sent = at(x.sent, 9); lead.linkedinChecklist.emailSent = true; }
      const li = x.li || {};
      Object.assign(lead.linkedinChecklist, li);
      if (li.requestSent) ms.linkedinRequested = at(x.sent != null ? x.sent : x.d, 10);
      if (li.connected) ms.connected = at(Math.max((x.sent || 0) - 2, 0), 15);
      if (x.rep != null) ms.replied = at(x.rep, 14);
      if (['positive', 'meeting', 'qualified', 'proposal', 'won', 'lost'].includes(x.s) && x.rep != null) ms.positive = at(x.rep, 14);
      if (x.mt != null) ms.meeting = at(x.mt, 11);
      if (x.q != null) ms.qualified = at(x.q, 16);
      if (x.pr != null) ms.proposal = at(x.pr, 16);
      if (x.w != null) ms.won = at(x.w, 16);
      if (x.s === 'lost') ms.lost = at(Math.max((x.mt || 1) - 3, 0), 16);
      if (x.s === 'notInterested') ms.notInterested = at(x.rep, 14);
      (x.fu || []).forEach((n) => { lead.followups[n] = { doneAt: at(Math.max(x.sent - [0, 3, 7, 14][n], 0), 9) }; });
      // Activity log mirrors milestones.
      const labels = { added: 'Lead added', verified: 'Email verification recorded', researched: 'Research completed', drafted: 'Email drafted', submitted: 'Submitted for founder review', approved: 'Approved by founder', sent: 'Email sent (manually)', linkedinRequested: 'LinkedIn request sent', connected: 'LinkedIn connected', replied: 'Replied', positive: 'Positive reply', meeting: 'Meeting booked', qualified: 'Qualified', proposal: 'Proposal sent', won: 'Won', lost: 'Lost', notInterested: 'Not interested' };
      lead.activity = Object.keys(ms).filter((k) => labels[k]).map((k) => ({ at: ms[k], text: labels[k] })).sort((a, b) => a.at.localeCompare(b.at));
      lead.updatedAt = lead.activity[lead.activity.length - 1].at;
      return lead;
    });
  }

  return { build };
});
