---
name: gbs-ads-planner
description: Get Bee Seen's Meta Ads Business Calculator and multi platform Marketing Planner. Forecasts leads, customers, CPL, CAC, revenue, ROAS, breakeven ROAS and net profit from a monthly ad budget for 37 industries (clinics, real estate, education, door manufacturers, D2C, fashion, SaaS and more), and builds modular marketing plans across Meta, Google, LinkedIn, JioHotstar, TikTok, Pinterest and Amazon Ads, with platform choice, budget split, audiences, funnel, creative, forecasts and a 90 day plan. Use this skill whenever someone asks how many leads or sales a budget will bring, whether ads will be profitable, what ROAS or CPL they need to break even, how to split an ad budget across platforms, or wants a media plan, ads forecast, campaign plan or marketing plan for a business or GBS client, even if they never say "calculator" or "planner". Also use it when they want the interactive calculator tool file or a branded forecast report.
---

# GBS Ads Planner

This skill wraps the real Get Bee Seen Meta Ads Business Calculator and Marketing Planner. The numbers come from the same engine as the web tool (`scripts/engine/`), run through a small command line script. Do the math through the script, not by hand. That way every figure you quote matches what the client sees in the tool, and the engine's guards apply: no negative counts, no NaN, and people are always whole numbers.

## What you can produce

1. **Calculator forecast**: one business, one monthly Meta Ads budget, giving leads, customers, CPL, CAC, revenue, ROAS, breakeven figures, net profit and a verdict.
2. **Marketing plan**: any mix of the 14 planner modules for any market, across up to 7 ad platforms.
3. **Branded report**: either result as a standalone Get Bee Seen HTML report that prints cleanly to PDF.
4. **The interactive tool**: `assets/meta-ads-business-calculator.html` is the full single file web app (calculators, planner, reports). Hand it over when the person wants to play with the numbers themselves, show a client live, or host it. For Hostinger, rename it `index.html` and upload it to `public_html`.

## The script

Run everything from the skill directory with Node (18 or newer, no install needed). Output is JSON.

```bash
node scripts/gbs.js list                          # calculators, planner industries, modules, countries, objectives, platforms
node scripts/gbs.js fields <calculator>           # inputs: id, label, unit, default, range, options, presets
node scripts/gbs.js calc <calculator> '<json>' --html <out.html>
node scripts/gbs.js plan '<json>' --html <out.html>
```

Pass the JSON inline or as a path to a `.json` file. You can name the calculator by key (`clinic`) or by name (`Healthcare / Clinic`), and the planner industry by label (`Door manufacturer`).

## Workflow: calculator forecast

1. **Pick the calculator.** Run `list` and match the business to the closest calculator. Use `custom` only when nothing fits.
2. **Read its inputs.** Run `fields <key>`. Input ids differ by industry: a clinic has `consultFee` and `treatValue`, not `ticket`. The script ignores unknown ids and lists them under `warnings`, so read the warnings.
3. **Collect the numbers that matter most.** In practice these are:
   - the monthly budget (`spend`)
   - the sale value (ticket, AOV, project value, treatment value)
   - the margin
   - the close or conversion rates
   - the location (`loc`, a list)

   Ask for these in one short message if they're missing. Don't hold the forecast hostage to every field. Run it with what you have, and say which inputs came from defaults (`defaults_used`). The defaults are placeholder assumptions, not market benchmarks. If a preset from `fields` fits the business (for example a high ticket clinic), its values make a better starting point than the raw defaults.
4. **Run it.** Use `calc <key> '<json>' --html <path>`. Giving any advanced input (CPM, CTR and the like) switches the calculator to advanced mode automatically. A spend without a daily budget gets one derived for you.
5. **Present it** (format below), and attach the report file if the person wants something to send.

To compare budgets or scenarios, run `calc` once per scenario and show a small table. Don't extrapolate by hand: the engine models efficiency loss as budget rises (`drop`).

## Workflow: marketing plan

Planner input JSON. Every field is optional except that you should always set `industry`:

```json
{
  "industry": "Door manufacturer",
  "country": "india",
  "cities": ["Bengaluru", "Chennai"],
  "product": "Teak and WPC doors",
  "objective": "dealer",
  "budget": 150000,
  "pmode": "auto",
  "platforms": ["meta", "google", "linkedin"],
  "amazonListed": "yes",
  "modules": ["platforms", "budget", "forecast"],
  "custom": "dealer acquisition in Tamil Nadu",
  "ov": { "range": "single" }
}
```

- `modules`: generate only what the person asked for. If they want "the budget split", that is `["budget"]`, not the whole plan. Use `"all"` for a full plan. `custom` is a free text module driven by the `custom` description. Ids come from `list`.
- `pmode`: `"auto"` lets the planner choose platforms from industry, market, objective and budget. `"manual"` uses `platforms`, but platforms that aren't available still get dropped. TikTok is excluded in India, JioHotstar is India only, and Amazon needs `amazonListed: "yes"`.
- `country`: a key from `list`. Any other market name works too and becomes `other`. `cities` defaults to Bengaluru for India; pass the real cities or regions.
- `budget` is in rupees, like every amount in the planner and calculator. Convert from other currencies before passing it, and say so in your answer.
- `ov.range`: `"single"` gives an expected case forecast instead of conservative to aggressive ranges.

Read `platform_checks` for the reasons and cautions behind each platform decision, `platforms` for the split, `forecast_totals` for blended totals, and `modules[].content` / `modules[].insights` for each module. Rephrase into a tight answer rather than pasting module text wholesale. For anything long, the HTML report is the deliverable.

## How to present results

Lead with the verdict and the handful of numbers a business owner decides on. Example shape:

> **Profitable at these numbers.** ₹80,000 a month in Bengaluru should bring about 466 leads and 117 patients.
>
> | | Projected | Breakeven |
> |---|---|---|
> | CPL | ₹172 | ₹700 |
> | CAC | ₹681 | ₹2,777 |
> | ROAS | 7.04x | 1.73x |
> | Net profit | ₹2.46 L | |
>
> Assumed from defaults: consultation fee ₹700, treatment value ₹9,000, 35% treatment conversion. Send me your real figures and I'll rerun it.
>
> These are estimates based on the assumptions entered, not guaranteed Meta Ads results.

Guidelines, and why they matter:

- **Say these are projections, not guarantees.** Ad results depend on creative, offer, auction and landing page. Overpromising damages GBS's credibility with clients.
- **Never invent benchmarks** ("the average CPL for clinics in Bengaluru is ₹150"). The tool ships no benchmark data on purpose. Quote the assumptions as assumptions, and ask for the client's real numbers.
- **Name the biggest lever** when the result is weak: the input that would flip the verdict, usually close rate, ticket size or CPL against its breakeven. That is more useful than a wall of metrics.
- **Use Indian formatting for India**: ₹, lakhs (L) and crores (Cr), as the script's `text_summary` and cards already do. Use the cards' formatted values instead of reformatting raw numbers.
- **Keep the house style in copy you write**: no hyphens or dashes in client facing text. Write "follow up", "lead to sale", "B2B buyers", and use a colon or a new sentence where you'd reach for a dash. A minus sign on a loss is fine.
- **Report files**: save them where the person can open them, and give the path or attach the file. The report loads Get Bee Seen fonts from Google Fonts and prints to PDF from any browser.

## Reference

`references/metrics.md` explains each metric (ROAS vs profit ROAS, breakeven ROAS, CAC vs LTV, ACOS and TACOS) and how the planner decides platforms and budget. Read it when someone asks what a number means, or why the planner chose or excluded a platform.
