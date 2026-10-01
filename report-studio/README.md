# GBS Client Report Studio

Agency staff turn a client's monthly platform data into a client-facing
**Monthly Business Review**: an A4-landscape report in the client's brand,
co-branded by Get Bee Seen, exported as a PDF.

`CLAUDE.md` is the product spec. `prototype/gbs-client-report-studio.html` is
the visual and behavioural spec, and `reference/` holds the PDF it exports.

## Status

Build steps 1 and 2 of 5 (see `CLAUDE.md`) are done:

- **Studio shell** in the GBS brand: sign-in, dashboard, clients
  (create, edit, delete), reports list, report viewer.
- **Supabase** schema, row-level security, private storage bucket and demo
  seed, checked against Postgres by `scripts/check-db.sh`.
- **Report renderer**: the prototype's 23 pages as React components, fed by
  the Thrishank Doors August 2026 fixture.
- **PDF export**: `GET /api/reports/:id/pdf`, rendered by Playwright from the
  same components as the preview.
- **Review panel** (staff only): data conflicts with a choice of value,
  sample-data and missing-data warnings, copy confidence, internal notes.

Create report, templates, brand assets, analytics and settings are
placeholders for steps 3 to 5.

## Run it

```bash
npm install
npx playwright install chromium   # or set PLAYWRIGHT_CHROMIUM_EXECUTABLE
npm run dev                       # http://localhost:3000
```

With no Supabase variables set, the studio starts in **demo mode**: any
email and password sign in, data comes from the seed fixture, and changes
live in memory until the server restarts. A banner says so on every page.
Demo mode is refused in production builds unless `GBS_DEMO_MODE=1`.

### With Supabase

1. Copy `.env.example` to `.env.local` and set the project URL and anon key.
2. Apply `supabase/migrations/` (Supabase CLI `supabase db push`, or paste
   into the SQL editor), then `supabase/seed.sql` for the demo data.
3. Sign up a user in Auth, then link it to the agency. The query is at the
   top of `seed.sql`.

Every query runs as the signed-in user, so RLS decides what they see. The
PDF route forwards the user's session cookies to the print page, so exports
go through RLS too. No service-role key is used.

## Checks

| Command | What it checks |
| --- | --- |
| `npm test` | Analysis, conflicts and copy (`node --test`, no extra packages) |
| `npm run typecheck` | TypeScript |
| `npm run build` | Production build |
| `scripts/check-db.sh` | Migration and seed apply to Postgres 16, then 17 RLS checks: agency isolation, client viewers see only shared reports and never internal notes or insight confidence |
| `npm run compare -- --fetch http://127.0.0.1:3000` | Exports the demo report and compares it page by page with the prototype and the reference PDF (needs `pdftoppm`) |

### PDF fidelity

`npm run compare` exports the prototype through the same Playwright
pipeline, with the same fonts, and compares pixels at 96 dpi. Current
result: **21 of 23 pages are pixel-identical** to the prototype, every
number on every page matches `reference/`, and page count (23) and paper
size (841.92 × 595.92 pt) match.

The two pages that differ do so on purpose. The prototype gives the
"Top performing on views" pill the class `top`, which its print CSS also
uses to hide the studio header, so the pill vanishes from its PDF. The port
shows it (content breakdown, pages 7 and 8).

Against `reference/` itself, pages differ by 0.4–3.3% of pixels because
glyphs there are spaced slightly wider. That file was printed in a
different browser setup. The prototype, exported here, differs from it by
the same amounts, so the gap is in how the reference was printed, not in
the port.

Details that matter for fidelity:

- **Fonts** are self-hosted static TTFs (`src/fonts/`). `next/font/google`
  serves variable fonts, which set text slightly narrower than the
  reference.
- **Paper size**: the PDF uses explicit A4 (297 × 210 mm), not
  `preferCSSPageSize`, which rounds the page to 594.96 pt tall instead of
  595.92 pt.
- **No trailing blank page**: the last page has no `break-after`.

## Layout

```
src/
  app/(app)/                Studio: root layout, sign-in, server actions
  app/(app)/(studio)/       Pages behind sign-in
  app/(print)/print/...     Bare print view that Playwright renders (no Tailwind)
  app/api/reports/[id]/pdf  PDF export
  components/report/        Report renderer: pages.tsx (buildPages), charts, marks, report.css
  components/studio/        Studio pieces; components/ui/ holds shadcn/ui primitives
  lib/analysis.ts           Pure analysis (ported analyze())
  lib/copy/generators.ts    Rule-based copy, confidence, expand text (ported G/EXT/CONF)
  lib/report/               Report types and conflict handling
  lib/data/repo.ts          Supabase and demo data access
  lib/pdf/render.ts         Playwright PDF rendering
  lib/fixtures/             Thrishank Doors, August 2026
supabase/                   Migrations, seed, RLS tests
scripts/                    check-db.sh, compare-reference.mjs
```

## Data rules carried into the code

- **Conflicts.** A figure that disagrees with what other confirmed figures
  calculate is detected in `lib/report/conflicts.ts` (follower growth: 7.4%
  reported, 7.2% calculated). It stays out of the report until a reviewer
  picks a value in the viewer. The pick is stored in `reports.resolutions`;
  the fixture records "reported", as in the reference.
- **Sample data.** Per-piece figures in the fixture are sample values,
  apart from those confirmed in the brief. They are marked `provenance:
  'sample'` and listed in the review panel. Source screenshot pages show
  placeholder renders only for demo data; a real report without uploads
  gets no such page.
- **Staff-only content.** Internal notes, warnings and confidence render
  only in the studio. The report components never read them.

## Notes

- shadcn/ui components in `src/components/ui/` were written by hand in
  shadcn's format, because the shadcn registry was unreachable from the
  build environment. `components.json` is in place, so
  `npx shadcn add <component>` works where the registry is reachable.
- Next.js 16 renamed `middleware.ts` to `proxy.ts`. `src/proxy.ts`
  refreshes the Supabase session and redirects signed-out visitors.
