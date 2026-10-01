# GBS Client Report Studio

Agency staff turn a client's monthly platform data into a client-facing
**Monthly Business Review**: an A4-landscape report in the client's brand,
co-branded by Get Bee Seen, exported as a PDF.

`CLAUDE.md` is the product spec. `prototype/gbs-client-report-studio.html` is
the visual and behavioural spec, and `reference/` holds the PDF it exports.

## Status

Usable for real monthly reports, with figures typed in from screenshots.
Build steps 1 and 2 of 5 (see `CLAUDE.md`) are done, plus a manual-entry
version of step 3:

- **Create report**: pick the client and month, type the Instagram
  Insights and Meta Ads figures, add each post, attach the screenshots
  (duplicates are skipped by file hash), choose the template and pages.
  Impossible values (reach above impressions, a post outside the month) are
  refused with a message. **Edit data** later from the report.
- **Client branding**: upload a logo and the colours are suggested from it;
  adjust and save. Every report for that client follows.
- **Report status**: Draft, Pending, Ready for review, Delivered.

- **Studio shell** in the GBS brand: sign-in, dashboard, clients
  (create, edit, delete), reports list, report viewer.
- **Storage and sign-in without external services**: clients and reports
  live in one JSON file on the server; the team signs in with a shared
  studio password.
- **Report renderer**: the prototype's 23 pages as React components, fed by
  the Thrishank Doors August 2026 fixture.
- **PDF export**: `GET /api/reports/:id/pdf`, rendered by Playwright from the
  same components as the preview.
- **Review panel** (staff only): data conflicts with a choice of value,
  sample-data and missing-data warnings, copy confidence, internal notes.

Still to come: reading figures from screenshots automatically (step 3),
Claude-written text and on-page editing (step 4), share links and present
mode (step 5). The Templates, Brand assets, Analytics and Settings pages are
placeholders.

## Run it

```bash
npm install
npx playwright install chromium   # or set PLAYWRIGHT_CHROMIUM_EXECUTABLE
npm run dev                       # http://localhost:3000
```

In development with no `STUDIO_PASSWORD`, any password signs in and a banner
says so. For anything online, copy `.env.example` to `.env.local` and set:

- `STUDIO_PASSWORD`: the password the team signs in with.
- `SESSION_SECRET`: a long random string that signs the session cookie.

Production builds refuse to start a session without both. Serve the studio
over HTTPS: the session cookie is Secure in production.

### Deploy

`Dockerfile` builds a production image with Chromium for PDF export:

```bash
docker build -t gbs-report-studio .
docker run -p 3000:3000 -v gbs-data:/app/data \
  -e STUDIO_PASSWORD=... -e SESSION_SECRET=... gbs-report-studio
```

Any host that runs a container and gives it a persistent disk works
(Render, Railway, Fly.io, a small VPS). Mount the disk at `/app/data` and
put HTTPS in front. Run one instance only: the data file is not shared
between servers.

### Data

Clients, reports, reviewer choices and internal notes are stored in
`data/studio.json` (or `$DATA_DIR/studio.json`); uploaded screenshots and
logos in `data/files/`, served only to signed-in staff. The file is created from
the Thrishank Doors seed on first run; delete it to start again from the
seed. Writes are queued and atomic (temporary file, then rename). This
suits one server with a persistent disk. Back the file up like any other
business record. It is not shared between servers, and it is not in git
(`data/` is ignored).

## Checks

| Command | What it checks |
| --- | --- |
| `npm test` | Analysis, conflicts, copy and report form validation (`node --test`, no extra packages) |
| `npm run typecheck` | TypeScript |
| `npm run build` | Production build |
| `STUDIO_PASSWORD=… npm run compare -- --fetch http://127.0.0.1:3000` | Exports the demo report and compares it page by page with the prototype and the reference PDF (needs `pdftoppm`) |

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
  lib/data/repo.ts          Data access over the JSON file store
  lib/auth/session.ts       Studio password and signed session cookie
  lib/pdf/render.ts         Playwright PDF rendering
  lib/fixtures/             Thrishank Doors, August 2026
scripts/                    compare-reference.mjs
```

## Data rules carried into the code

- **Conflicts.** A figure that disagrees with what other confirmed figures
  calculate is detected in `lib/report/conflicts.ts` (follower growth: 7.4%
  reported, 7.2% calculated). It stays out of the report until a reviewer
  picks a value in the viewer. The pick is stored with the report; the
  fixture records "reported", as in the reference.
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
  redirects visitors without a session cookie; every page and route also
  verifies the cookie's signature on the server.
- The PDF route forwards the signed-in user's cookies to the print page it
  renders, so exports need a valid session too.
