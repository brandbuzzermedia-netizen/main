# Point Vision Lead Engine

An internal outbound pipeline for Point Vision. Each day the team finds **15 well-fitting prospects**, researches them, drafts personalised outreach, has a founder review it, sends it **by hand**, and tracks what happens.

It is deliberately not a mass-emailing tool. Nothing is scraped, nothing is sent automatically, and nothing on LinkedIn is automated. The "AI" is a deterministic engine (`js/engine.js`) that works **only from research the team entered**. If a fact isn't in the research, it doesn't go in the email.

## Run it

**On your own (one browser):** open `index.html`, or `dist/point-vision-lead-engine.html` (the whole app in one file). Data is saved in that browser's localStorage.

**As a shared workspace (intern + founder see the same data):**

```bash
node server.js                                   # http://127.0.0.1:8090, this machine only
HOST=0.0.0.0 PV_PASSWORD=choose-one node server.js   # share on your network, password protected
node server.js --empty                           # first run without sample leads
```

No dependencies, Node 18+. The server stores everything in `data/pv-lead-engine.json` (git-ignored; back it up). Browsers sync every ~12 seconds and on every save, and merge per lead (newest edit wins). If the server is unreachable the app keeps working and syncs when it is back. `PV_PASSWORD` turns on HTTP basic auth with any username. Always set it when `HOST` isn't `127.0.0.1`.

| Command | What it does |
|---|---|
| `npm start` | Shared-workspace server (`server.js`) |
| `npm test` | Engine tests: duplicates, queries, scoring, outreach rules, follow-ups, metrics |
| `npm run build` | `dist/point-vision-lead-engine.html`, one self-contained file (local mode) |

## The operating model

**Intern** → Lead Finder → add 15 prospects → research → signals → email + verification → generate personalisation → submit.
**Founder** → review one at a time → add insight → approve → send from own inbox → LinkedIn by hand → track response → book meeting → move through the pipeline.

Use the **Intern / Founder** switch in the top bar to change the home screen.

## Pages

| Page | What it does |
|---|---|
| Intern Workspace | Daily checklist (auto-ticked from today's logged work, `x / 15`), a queue sorted by score with the next step for each lead, and founder feedback on rejected drafts |
| Founder Workspace | Today's review with research summary, score, opportunity and email, plus Approve / Edit / Reject. Also the ready-to-send list, follow-ups due, and open conversations |
| Dashboard | `0 / 15 Added`, today's flow (Prospecting → … → Meeting), today's activity, all-time conversion percentages |
| Lead Finder | Builds Google X-ray searches (people, company pages, hiring and news signals) from ICP selections. Copy Search Query / Open in Google. Search strings only |
| Leads | Searchable, sortable table with the requested columns and filters, plus CSV export. Add/edit form flags duplicates by email, LinkedIn URL, or company + name. Pasting a LinkedIn URL fills in the name |
| Lead page | Status, outbound tracking: **Email Sent** → LinkedIn Follow-up (Open LinkedIn + checklist), response logging, Day 3/7/14 follow-ups, LinkedIn strategy, score breakdown, activity log |
| Research | Overview, recent signals, hiring signals, technology and executive signals. Empty fields show **Not Found**. Opportunities (FACT / INFERENCE / HYPOTHESIS + confidence) and the score update as you type |
| Email Generator | Hook, problem hypothesis, Point Vision relevance, value proposition, CTA, and three versions (A Direct, B Insight-led, C Founder-to-founder). The editor has live checks |
| Founder Review | One prospect at a time. Approve, Edit, Regenerate, Reject (send back with a note, or disqualify), Save, Mark Ready to Send |
| Pipeline | Kanban across all 16 stages with drag-and-drop (a stage menu on phones) |
| Follow-ups | What's due now, ready-to-send emails, LinkedIn requests to make, upcoming reminders |
| Analytics | Weekly totals, day-by-day table, and the top industry / title / angle / signal / variation / pain point. Toggle between this week and all time |
| Settings | Point Vision profile, ICP builder (industries, titles, Country → State → City, sizes), daily target, tone, CTA style, follow-up days, word limits, phrases to avoid, scoring weights, materials library, backup / restore, sample-data controls |

## Guardrails

- **No invention.** Opportunities quote the research verbatim as FACT, then label the INFERENCE (possible challenge) and the HYPOTHESIS (where Point Vision might help) separately. With no signals, the generator refuses to write an email.
- **Draft checks.** Every draft is checked for the 60–120 word range, an opening sentence that contains a real observation, the avoid-list (`Hope you're doing well`, `I came across your profile`, `leverage`, `synergy` …), and any number that doesn't appear in the research (e.g. a made-up "40%"). Hard errors ask for confirmation before submitting.
- **Case studies and results** appear only if someone uploaded them under Settings → Materials for the same industry, and only by title.
- **Analytics** count only logged milestones. With no data they say "Not enough data yet", never an estimate. Funnel maths treats a later stage as proof of an earlier one (a booked meeting implies a reply), but never writes dates that didn't happen.
- **Manual sending.** "Open in mail app" prepares a draft in your own mail client. You send it, then click **Email Sent**. LinkedIn is links and checkboxes only.

## Lead score (100 points, internal only)

ICP Fit 25 (industry + location) · Decision Maker 20 (seniority, target title) · Opportunity Signal 20 (number and confidence of signals) · Company Fit 15 (size, description, products) · Personalization Data 10 (research fields filled) · Timing 10 (hiring, funding, launch, expansion, leadership, tech change, partnerships, transformation). Weights are editable and normalised to 100. **80+ High, 60–79 Medium, under 60 Low.** A manual score can override the calculated one per lead.

## Sample data

21 fictional leads at every stage, so the workflow can be demonstrated straight away. Their emails use the reserved `.example` domain, so nothing can reach a real inbox. Remove them in **Settings → Data**.

## Files

| File | Purpose |
|---|---|
| `js/engine.js` | Pure logic: reference data, X-ray queries, duplicates, opportunity rules, scoring, outreach, lint, LinkedIn, follow-ups, metrics. Used by the browser and by Node |
| `js/seed.js` | Sample leads |
| `js/store.js` | localStorage persistence + optional server sync |
| `js/ui.js` | Escaping template helper, icons, toasts, modals |
| `js/app.js` | Shell, routing, field binding, shared lead actions |
| `js/views/*.js` | One file per page area |
| `server.js` | Optional zero-dependency shared-workspace server |
| `build.js` | Single-file build |
