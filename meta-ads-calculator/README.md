# Meta Ads Business Calculator

Calculate leads, sales, revenue, CAC, CPL, ROAS, ROI and profitability before you spend on Meta Ads. Separate calculators for Service businesses, B2B, B2C / Ecommerce and door manufacturers / retailers (with itemised door costs, dealer campaigns, target calculators and market reference prices in `js/market.js`). Built for Get Bee Seen.

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
