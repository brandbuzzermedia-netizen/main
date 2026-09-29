# Meta Ads Business Calculator

A planning tool for Get Bee Seen (GBS), the digital marketing and website agency Mehul owns. It answers: "If I spend ₹X on Meta Ads, how many leads / sales will I get, what will they cost, and will the campaign be profitable?" It is used with clients and as a lead-gen asset, so it must look on-brand and never show misleading numbers.

Four business models, each with its own funnel, inputs, formulas and results: **Service business**, **B2B**, **B2C / Ecommerce** and **Door manufacturer / retailer**. The door model is a specialised module (Simple and Advanced modes, itemised door costs, dealer campaigns, target calculators, simulators, market reference data) that plugs into the same engine.

## Stack and commands

Plain HTML, CSS and vanilla JS. No framework, no bundler, no runtime dependencies. Node is only needed for the build and tests.

```
npm start        # serve on http://localhost:8080 (or just open index.html)
npm test         # node test/smoke.test.js  (formulas, tween helpers, render path)
npm run build    # writes dist/meta-ads-business-calculator.html (single file, everything inlined)
```

Always run `npm test` after touching formulas, and `npm run build` before handing over a publishable file.

## File map

- `index.html` – all static markup: header, hero (receipt + bee), ribbon, three sections with banners, footer. The calculator itself is rendered by JS into `#calc-root`.
- `css/styles.css` – brand tokens in `:root`, dark-theme overrides, components, and the MOTION block at the bottom.
- `js/market.js` – the market reference database for the door module (door prices, materials, laminate, hardware, labour, finishing, packaging, transport, installation; location, quality and finish multipliers; typical CPM by location). Every row has `source` and `updated`. All current rows are unverified GBS planning estimates: replace them with real supplier quotes.
- `js/door.js` – the door module. Defines `globalThis.MABC_DOOR(E)`, which app.js calls with its engine helpers to register `MODELS.door`.
- `js/app.js` – everything else, in this order: helpers and formatters, motion helpers (`tweenText`), hero receipt, `MODELS` (fields, presets, `compute`), state and persistence, `setModel` / `shell` / `update`, goal planner, copy summary, scroll reveals.
- `assets/` – real GBS brand files: `logo-horizontal.png`, `logo-stacked-white.png`, `bee.png`, `badge.png`. `img[data-asset]` tags get their `src` from the `ASSETS` map in app.js.
- `build.js` – inlines css, every `js/*.js` script tag and assets/*.png into one HTML file in `dist/`.
- `test/smoke.test.js` – dependency-free tests using a small DOM stub and the `__MABC_EXPOSE__` hook at the end of app.js.

## How the app works

1. User picks a model (`setModel`). Nothing is calculated until they do.
2. `shell()` builds the form from `MODELS[key].fields`, grouped by each field's `group`, plus containers for results and the goal planner.
3. Any input change updates `state[cur]`, saves to localStorage (`mabc:<model>`), and calls `update()`.
4. `update()` calls `MODELS[cur].compute(values)` and re-renders `#res-main` with `innerHTML` (verdict, cards, funnel, P&L, break-even meter, scenarios, scaling table), then `animateResults()`.

### The `compute(v)` result contract

Every model returns the same shape; the renderer depends on it:
`unit, unitP, units, leads?, total, spend, revenue, net, roas, roasLabel, cac, limit, limitLabel, ltvcac, ltv, roi, funnel[{l,n,r,c:[label,cost]}], cards[{k,v,s,t?}] (exactly 6), more[[label,value]], pnl[[label,amount]], note?`

- `units` = the thing being sold (customers / deals / orders). `cac` is all-in (ad spend + other monthly costs) per unit.
- `limit` = break-even cost per unit (gross profit or contribution per unit). The break-even meter compares `cac` to `limit`.
- Optional `leads` makes the scenario table show a Leads row (Service and B2B only).
- Optional `x` carries model specific extras (the door module keeps its whole calculation there for its own panels).

### Engine hooks (all optional, used by the door module)

Fields: `F(...)` numbers, plus option fields `{kind:'opt', type:'seg'|'cards'|'chips'|'select'|'text', options}`; any field can have `show(v)` (conditional), `simple` (visible in Simple mode) and `c` (compact row). Model keys: `modes` (Simple / Advanced switch, stored as `v.mode`), `groups` (per group `collapse`, `open`, `note`, `matrix`), `derived(v,r)` (fills `data-d` notes and group subtotals after each update), `onOpt`, `onPreset`, `actions` (buttons with `data-act`; return `false` to skip the re-render), `formIntro`, `layout(parts,r,v,E)`, `verdict`, `scenario(kind,v)`, `scenRows`, `scenNames`, `scenNote`, `goalPanel` / `renderGoal` / `goalInput` (replaces the goal planner), `renderSims` / `after` / `simInput`, `summary`. Existing models use none of them.

### Formulas

Common top of funnel: `impressions = spend / CPM * 1000`, `clicks = impressions * CTR`.

- **Service**: leads = clicks * click→lead. Then contacted → appointment booked → appointment held → customer, each a % of the previous stage. Revenue = customers * first-sale value. Gross profit = revenue * margin. Net = gross profit − ad spend − other monthly costs. LTV = gross profit per customer * lifetime purchases. LTV:CAC = LTV / all-in CAC.
- **B2B**: leads → MQL → discovery call held → proposal → deal won. Revenue = deals * first-year contract value. LTV = first-year gross profit * years retained. Payback months = CAC / (gross profit per deal / 12). Shows "chance of at least 1 deal" = 1 − e^(−deals) because B2B volume is lumpy.
- **Door** (customer campaigns): leads come from CPM, CTR and landing page conversion (automatic) or spend ÷ CPL (manual CPL). Then qualified → quotation → site / showroom visit → order, each a % of the previous stage. Doors sold = orders × doors per order. Selling price = door area (width × height) × price per sq ft, or a price per door. Cost per door is itemised: manufacturer (raw material × quantity × (1 + wastage), laminate, adhesive, labour per door or monthly ÷ production, overhead ÷ production, finishing, hardware, packaging, transport per door or per trip ÷ doors per trip, commissions and provisions as % of price), retailer (purchase price after discount plus landed costs), or both blended by share manufactured. Installation only counts when the business pays. Net = revenue − doors × cost per door − ad spend − campaign costs. ROAS = revenue ÷ ad spend; profit ROAS = net ÷ ad spend; ROI = net ÷ (door cost + ad spend + campaign costs). Breakeven ROAS at this budget = (spend + campaign costs) ÷ (margin × spend); breakeven CPL = gross profit per lead × spend ÷ (spend + campaign costs). Likely ranges come from the conservative (CPL up 15%, qualification down 15%, later rates down 10%) and aggressive (CPL down 10%, qualification and conversion up 10%) scenarios. Dealer and architect objectives switch to the trade funnel: leads → qualified → meetings → sample requests → onboarded → first order, with trade price = selling price × (1 − trade discount) and LTV from first plus repeat orders.
- **B2C**: clicks → landing page views → add to cart → checkout → order. Booked revenue = orders * AOV. Delivered orders = orders * (1 − RTO%). Kept revenue = delivered * AOV. Contribution = kept revenue − product cost − gateway fees − (shipping per order * ALL orders, because returns still cost shipping). Net = contribution − ad spend − other costs. ROAS shown is Meta-reported (booked); "Net ROAS" uses kept revenue.

Scenarios: conservative = CPM +10% and every field flagged `scen:true` × 0.9; optimistic = CPM −8% and × 1.1. Scaling: each doubling of budget multiplies CPM by `1 + drop%` (`drop` field, default 10). The goal planner solves for the budget that yields a target number of units, including that inflation.

## Common changes

- **Add or change an input**: edit the `F(...)` list in the model. Signature: `F(id, label, unit, default, min, max, step, group, help, scen)`. Use it in `compute`. Add the id to any preset that should set it. The test suite fails if a preset references an unknown id.
- **Add a niche preset**: append `[key, label, {fieldId: value}]` to the model's `presets`.
- **Add a fourth model**: add an entry to `MODELS` that satisfies the result contract, then add a card in `index.html` (`data-m`, `data-pick`), a tab entry is generated automatically, and add a comparison-table column.
- **Money**: always `inr()` (₹, en-IN grouping, L / Cr above one lakh / crore). Counts: `num()`. Ratios: `xx()`. Percent: `pct()`.
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

- Hero load sequence, ribbon wipe, bee flight and badge float are CSS-only.
- Scroll reveals: add class `rv` (and optional `style="--d:n"` for stagger). They are only hidden when JS has added `js-rv` to `<html>`, so content is never lost without JS.
- Results re-render with `innerHTML` on every keystroke, which would restart CSS animations. So numbers and bars are animated in `animateResults()` instead: cards carry `data-k`, bars and the meter carry `data-w`, and the previous visible values are captured before each re-render. Do not add CSS entrance animations to elements inside `#res-main` except under `.fresh`.
- Do not use `animation-fill-mode: forwards` on hoverable elements; it overrides hover transforms.
- Everything must switch off under `prefers-reduced-motion` (a global rule in the MOTION block plus `RM.matches` checks in JS).

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
