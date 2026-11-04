# Point Vision Lead Engine: notes for Claude Code

Vanilla JS, no build step, no dependencies. `npm test` runs `test/engine.test.js`; `npm run build` writes `dist/`. Rebuild `dist/` after any change.

- All business logic lives in `js/engine.js` (UMD, pure, Node-testable). Views must not duplicate rules.
- Templating: use `html\`\`` from `js/ui.js`. It escapes every interpolation. Use `raw()` only for trusted markup.
- Data binding: inputs with `data-f="path"` inside `[data-lead=id]` write to the lead; `data-s="path"` writes to settings. `[data-live]` panels re-render on input. Click handlers go through `data-action` → `PV.actions`.
- Status changes go through `PV.setStatus` / `PV.stamp` so milestones (which drive all metrics) stay consistent.
- Hard rules: never invent facts, case studies or metrics; never auto-send email or automate LinkedIn; never scrape. Generated text may only draw on lead research, founder insight, Settings, and uploaded materials.
- Brand: coral `#FD3A25` used sparingly, charcoal `#27272A`, Urbanist, light surfaces.
