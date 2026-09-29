# Meta Ads Business Calculator

Forecast leads, customers, revenue, CAC, CPL / CPP, ROAS, profit ROAS, ROI and breakeven before you spend on Meta Ads. 37 industry calculators (lead generation, B2B, ecommerce, professional services, plus a custom funnel builder), each with its own funnel and cost structure, on one shared engine. Built for Get Bee Seen.

## Run it

Open `index.html` in a browser, or:

```
npm start        # http://localhost:8080
```

Fonts load from Google Fonts, so you need an internet connection for the brand typography.

## Develop with Claude Code

```
cd meta-ads-calculator
claude
```

`CLAUDE.md` gives Claude Code the project context: file map, formulas, brand rules and motion rules.

## Scripts

| Command | What it does |
|---|---|
| `npm test` | Checks every model's formulas, presets, the count-up helpers and the render path |
| `npm run build` | Creates `dist/meta-ads-business-calculator.html`, one file with everything inlined |
