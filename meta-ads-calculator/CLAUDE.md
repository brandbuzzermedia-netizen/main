# Meta Ads Business Calculator

A planning tool for Get Bee Seen (GBS), the digital marketing and website agency Mehul owns. It answers: "If I spend ₹X on Meta Ads, how many leads / sales will I get, what will they cost, and will the campaign be profitable?" It is used with clients and as a lead-gen asset, so it must look on-brand and never show misleading numbers.

A multi industry platform: **37 calculators** chosen from a "Select your industry" dashboard (lead generation, B2B, B2C / ecommerce, professional / local services) plus a **Custom industry** builder. Every industry has its own inputs, funnel, cost engine and revenue model; they share one calculation engine for ad maths, ROAS, profit ROAS, ROI, breakeven, ranges, scenarios, goals, insights, actual vs projected and the report. Doors is a deeper specialised module (itemised door cost, dealer campaigns, market reference prices, simulators).

The question every calculator answers: "If I spend ₹X on Meta Ads, what can I potentially generate, what will it cost, what revenue, what ROAS, and will I make a profit?" Every output is an estimate from the user's assumptions and must never be presented as a guaranteed result.

## Stack and commands

Plain HTML, CSS and vanilla JS. No framework, no bundler, no runtime dependencies. Node is only needed for the build and tests.

```
npm start        # serve on http://localhost:8080 (or just open index.html)
npm test         # node test/smoke.test.js  (formulas, tween helpers, render path)
npm run build    # writes dist/meta-ads-business-calculator.html (single file, everything inlined)
```

Always run `npm test` after touching formulas, and `npm run build` before handing over a publishable file.

## File map

- `index.html` – static markup: header, hero (receipt + bee), ribbon, the industry dashboard container `#industries`, the calculator container `#calc-root`, how it works, footer. Script order matters: market, benchmarks, framework, industries, door, app.
- `js/market.js` – the market reference database for the door module (door prices, materials, laminate, hardware, labour, finishing, packaging, transport, installation; location, quality and finish multipliers; typical CPM by location). Every row has `source` and `updated`. All current rows are unverified GBS planning estimates: replace them with real supplier quotes.
- `js/framework.js` – `MABC_FRAMEWORK(E).build(spec)` turns an industry definition into a model: universal inputs (monthly and daily budget, duration, locations (multi select; CPM starts from the average of their typical CPMs via `MABC_MARKET.blend`), audience, objective, forecast or manual mode, CPM, CTR, landing page conversion, frequency, CPL / CPP), the funnel, ROAS / profit ROAS / ROI, breakeven, likely ranges, scenario planner, goal calculator (revenue, customers, profit), insights, sensitivity, benchmark panel and the result layout.
- `js/industries.js` – the industry definitions (funnel stages, inputs, `econ()` cost engine and revenue model for each), the icon set `MABC_ICONS` and the dashboard catalogue `MABC_CATALOG` (groups, order, aliases such as Coaching → Education and Gym → Fitness).
- `js/benchmarks.js` – benchmark references by industry and metric with `sourceType`, `source` and `date`. **Intentionally empty**: never add numbers without a real source (verified industry source, agency history, Meta campaign data or the user's own history).
- `js/door.js` – the door module. Defines `globalThis.MABC_DOOR(E)`, which app.js calls with its engine helpers to register `MODELS.door`.
- `js/planner-data.js` – the Marketing Planner knowledge base: markets (with platform availability flags), business models, objectives, archetypes (ages with reasons, personas, messaging), the planner industry list mapped to calculator keys, the 7 platforms (roles, formats, targeting, tracking tags, starting cost placeholders), the 14 modules, funnels by business type, hooks, landing page types, FAQs and custom module playbooks.
- `js/planner.js` – the Marketing Planner (section `#planner`): 5 steps (Business → Objective → Platforms → Select modules → Plan), platform eligibility and scoring, budget allocation, per platform forecasting (ranges, scenarios, sensitivity, Amazon ACOS / TACOS) using `MABC_APP.econ(key)` from the industry calculators, one renderer per module (`M.<id>` returns `{ctrl, body, ins}`), plan report. Only selected modules are generated, shown in the navigation or put in the report. Saved in `mabc:planner`; the benchmark library in `mabc:benchlib`.
- `js/app.js` – the engine: helpers and formatters (`inr`, `num`, `cnt`, `pct`, `xx`), motion helpers, hero receipt, module registration and input sanitising, state and persistence, dashboard, industry picker, `shell` / `update`, actual vs projected, report, copy summary, scroll reveals.
- `assets/` – real GBS brand files: `logo-horizontal.png`, `logo-stacked-white.png`, `bee.png`, `badge.png`. `img[data-asset]` tags get their `src` from the `ASSETS` map in app.js.
- `build.js` – inlines css, every `js/*.js` script tag and assets/*.png into one HTML file in `dist/`.
- `test/smoke.test.js` – dependency-free tests using a small DOM stub and the `__MABC_EXPOSE__` hook at the end of app.js.

## How the app works

1. User picks an industry on the dashboard or in the Industry picker (`setModel`). Nothing is calculated until they do.
2. `shell()` builds the form from `MODELS[key].fields`, grouped by each field's `group`, plus containers for results, the goal calculator, actual vs projected and the report button.
3. Any input change is validated (no negatives, rates capped at 100%), stored in `state[cur]`, saved to localStorage (`mabc:<key>`), and `update()` runs. Actual results are saved separately (`mabc:actual:<key>`), saved benchmark references in `mabc:bench:<key>`.
4. `update()` calls `MODELS[cur].compute(values)` and renders `#res-main` through the model's `layout`, then `animateResults()`.
5. Every model's `compute` is wrapped at registration so any caller (form, scenarios, scaling, goals, tests) gets sanitised numbers.

### The `compute(v)` result contract

Every model returns the same shape; the renderer depends on it:
`unit, unitP, units, leads?, total, spend, revenue, net, roas, roasLabel, cac, limit, limitLabel, ltvcac, ltv, roi, funnel[{l,n,r,c:[label,cost]}], cards[{k,v,s,t?}] (6 or more), more[[label,value]], pnl[[label,amount]], note?, k`

`k` is the standard summary the report and actual vs projected use: `spend, impr, reach, clicks, leads, leadWord, costWord, cpl, customers, cac, revenue, gross, net, roas, profitRoas, roi, beRoas, beCpl, beCac, invest, ticket, unit, unitP, ltv`.

- `units` = the thing being sold (customers / deals / orders). `cac` is all-in (ad spend + other monthly costs) per unit.
- `limit` = break-even cost per unit (gross profit or contribution per unit). The break-even meter compares `cac` to `limit`.
- Optional `leads` makes the scenario table show a Leads row (Service and B2B only).
- Optional `x` carries model specific extras (the door module keeps its whole calculation there for its own panels).

### Engine hooks (all optional, used by the door module)

Fields: `F(...)` numbers, plus option fields `{kind:'opt', type:'seg'|'cards'|'chips'|'select'|'text', options}`; any field can have `show(v)` (conditional), `simple` (visible in Simple mode) and `c` (compact row). Model keys: `modes` (Simple / Advanced switch, stored as `v.mode`), `groups` (per group `collapse`, `open`, `note`, `matrix`), `derived(v,r)` (fills `data-d` notes and group subtotals after each update), `onOpt`, `onPreset`, `actions` (buttons with `data-act`; return `false` to skip the re-render), `formIntro`, `layout(parts,r,v,E)`, `verdict`, `scenario(kind,v)`, `scenRows`, `scenNames`, `scenNote`, `goalPanel` / `renderGoal` / `goalInput` (replaces the goal planner), `renderSims` / `after` / `simInput`, `summary`. Existing models use none of them.

### Industry definitions (js/industries.js)

`{key, name, cat, icon, flow, desc, kind:'lead'|'order' (or a function of v), unit, unitP, ad:{spend,cpm,ctr,lpConv}, stages:[{id,l,r,def,help}] (or a function of v with stageDefs), pre:[...], fields:[...], econ(v, c, n), costTitle, presets, panels?, onOpt?}`

- `kind` lead: leads = clicks × landing page conversion (or spend ÷ CPL in manual mode), then each stage is a % of the previous one. `kind` order: stages start from clicks (or purchases = spend ÷ CPP in manual mode).
- `econ(v, c, n)` is the industry's own economics: `c` = customers (last stage), `n` = {leads, clicks, counts}. Return `{revenue, lines:[[label, amount]], ltv?, revLabel?, extras?, warn?, note?}`. `lines` are the variable costs of those sales (COGS, shipping, commissions, brokerage, landed cost...).
- Field helpers: `V` price or value input (varies in scenarios, shown in Simple mode), `N` economics number, `K` compact cost input, `S` funnel stage. Stage rate fields are created automatically.

### Shared formulas (js/framework.js)

Top of funnel: `impressions = spend ÷ CPM × 1000`, `reach = impressions ÷ frequency`, `clicks = impressions × CTR`, CPC = spend ÷ clicks.
Gross profit = revenue − variable cost lines. Net = gross − ad spend − other campaign costs. Total investment = variable costs + ad spend + campaign costs.
ROAS = revenue attributed ÷ ad spend. Profit ROAS = net ÷ ad spend. ROI = net ÷ total investment × 100.
Breakeven ROAS = 1 ÷ gross margin, so it comes from each industry's own cost structure; the "with campaign costs" version is (spend + campaign costs) ÷ (margin × spend). Breakeven CPL / CPP = gross profit per lead or purchase × spend ÷ (spend + campaign costs). Breakeven CAC = gross profit per customer.
Recurring industries (SaaS, agency, accounting, fitness) say which months of revenue ROAS counts (`revLabel`) and show LTV separately.
Scenarios: conservative = acquisition cost +15%, conversion −10%, value −5%; aggressive = acquisition cost −10%, conversion +10%, value +5%. Likely ranges in the forecast come from those two scenarios.
Scaling: each doubling of budget multiplies CPM (and CPL) by `1 + drop%`. Goals and maximum profitable ad spend include that inflation.

### Doors (js/door.js)

- **Door** (customer campaigns): leads come from CPM, CTR and landing page conversion (automatic) or spend ÷ CPL (manual CPL). Then qualified → quotation → site / showroom visit → order, each a % of the previous stage. Doors sold = orders × doors per order. Selling price = door area (width × height) × price per sq ft, or a price per door. Cost per door is itemised: manufacturer (raw material × quantity × (1 + wastage), laminate, adhesive, labour per door or monthly ÷ production, overhead ÷ production, finishing, hardware, packaging, transport per door or per trip ÷ doors per trip, commissions and provisions as % of price), retailer (purchase price after discount plus landed costs), or both blended by share manufactured. Installation only counts when the business pays. Dealer and architect objectives switch to the trade funnel with trade price = selling price × (1 − trade discount) and LTV from first plus repeat orders.

## Common changes

- **Add or change an input**: edit the industry's `fields` in js/industries.js and use it in its `econ`. Signature: `F(id, label, unit, default, min, max, step, group, help)`; prefer the `V`, `N`, `K` helpers. The test suite fails if a preset references an unknown id.
- **Add an industry**: add a definition to `specs` in js/industries.js with its own stages and `econ`, then add its key to `MABC_CATALOG`. The dashboard card, picker entry, report and tests pick it up automatically. Users can also build one in the Custom industry calculator.
- **Add a benchmark**: only from a real source, in js/benchmarks.js, with `sourceType`, `source` and `date`.
- **Money**: always `inr()` (₹, en-IN grouping, L / Cr above one lakh / crore). People and orders: `cnt()` (whole numbers, 'under 1', never negative). Other numbers: `num()`. Ratios: `xx()`. Percent: `pct()`.
- **Division**: use `div(a, b)` (returns Infinity when b ≤ 0) and let formatters print "n/a". Rates go through `P()` which clamps to 0–100%.

## Brand system (Get Bee Seen)

- Colours: cream `#FFF2DC` (page), deep green `#196144` (primary), gold `#FFB933` (accent, CTAs), sage `#3E5D48`, ink `#262626`. Text on gold uses `--on-gold` (`#123F2C`) for contrast. Red/green/amber are kept only for loss/profit/warning states.
- Fonts (Google Fonts), the same stand-ins the main Get Bee Seen site uses: **Alfa Slab One** for headings (`--display`, stand-in for the real "Bunga"), **Archivo** 400–700 for body (`--body`, stand-in for "Neue Leiden"). Swap in the real font files if Mehul provides them.
- Alfa Slab One has a single weight. Always set `font-weight:400` on anything in `--display` (including `<b>` and headings), or the browser fakes a bold.
- Alfa Slab One is wide, so big numbers are protected: grid tracks use `minmax(0,1fr)` so tables can't push the page wider than the screen, `.card .v` sizes itself with container units (`14cqi`), and receipt amounts are `nowrap`.
- Elements reused from GBS proposals: hex-textured green banners with a gold numbered circle, gold pill kicker, gold ribbon with the rounded bottom-left cut, flush white cards with gold icon circles, outlined gold pills, gold left-bar callouts, green table headers, and the green signature box with the badge.
- Tone: playful but professional. Rounded shapes, generous space. Do not make it corporate-sterile or cutesy. Use the bee small and sparingly; never stretch it as a logo.
- Dark mode is supported through `prefers-color-scheme` and `[data-theme]`. The hero, banners and receipt stay green/cream in both themes.

## Motion rules

- Hero load sequence, the permanent ribbon ticker, the looping bee flight (crosses the hero every 10s) and badge float are CSS only; everything stops under reduced motion.
- Scroll reveals: add class `rv` (and optional `style="--d:n"` for stagger). They are only hidden when JS has added `js-rv` to `<html>`, so content is never lost without JS.
- Results re-render with `innerHTML` on every keystroke, which would restart CSS animations. So numbers and bars are animated in `animateResults()` instead: cards carry `data-k`, bars and the meter carry `data-w`, and the previous visible values are captured before each re-render. Do not add CSS entrance animations to elements inside `#res-main` except under `.fresh`.
- Do not use `animation-fill-mode: forwards` on hoverable elements; it overrides hover transforms.
- Everything must switch off under `prefers-reduced-motion` (a global rule in the MOTION block plus `RM.matches` checks in JS).

## Marketing planner rules

- Every module is optional. Never render, navigate to or report a module the user did not select. Editing modules must keep all other inputs.
- Recommendations are rules, not AI: say so where it matters (the custom module does). Never invent platform availability: use `COUNTRIES` flags and say "verify" when unsure. TikTok is excluded for India; JioHotstar is India only; Amazon needs a listing and a marketplace.
- Platform cost defaults are placeholders for India, not benchmarks. Forecasts show ranges by default and are labelled as projections.
- Output controls (inputs inside the plan) update only the module bodies (`refreshBodies`) so focus is never lost.

## Responsive rules (phone, tablet, laptop, desktop)

- Touch sizes live in `@media (pointer:coarse),(max-width:760px)`: every tap target is at least 40px (buttons and selects 44px), and every input, select and textarea is 16px so iOS does not zoom on focus.
- At 640px and below, the header nav collapses behind the Menu button (`.menu-btn`, toggles `html.menu-open`, Escape closes it).
- Below 1040px, the mobile results bar (`.mbar`) shows net profit, ROAS and customers. It only appears while the calculator's `.form-col` is on screen and `#res-main` is not. `mbar.update(r)` re-observes both after each render because `shell()` replaces them.
- Keep sticky chrome small: the planner bar stays on one line, and its steps collapse to numbers on phones, with only the current step labelled.
- Grids that hold tables use `minmax(0,1fr)` so they never cause sideways scroll.

## Copy and content rules

- Sentence case, plain verbs, buttons say exactly what happens.
- No hyphens or dashes in visible copy (labels, help text, notes, headings, copied summary). Write "breakeven", "Ecommerce", "first year", "total cost"; use words ("up 10%", "3 to 6 months", "n/a") instead of dashes. The one exception is the minus sign on negative money and ROI: it carries meaning, so never drop it. Formatters also suppress a meaningless minus on values that round to zero.
- Niche presets and the door market reference are illustrative starting points, not verified benchmarks. Market reference text must always say it is indicative and that actual prices vary by supplier, quality, size and finish. Door forecasts must show ranges and say they are projections, not guaranteed Meta Ads results. Keep the footer disclaimer. When Mehul has real GBS client averages, replace the preset numbers.
- Never invent contact details, URLs or claims about results. There is no contact button yet because no URL or number was provided.

## Publishing

The current live version is a Claude artifact built from the single-file output of `npm run build`. In a published page, external scripts are limited to a few CDNs and there is no network access to other sites, which is why images and code are inlined. localStorage works but must stay wrapped in try/catch.

## Open ideas

- Gold "Talk to Get Bee Seen" button in the footer (needs the URL, WhatsApp number or booking link).
- Branded PDF export of a result set for client proposals.
- Side-by-side comparison of two campaigns.
- Let the bee land next to the Start Calculating button after its flight.
