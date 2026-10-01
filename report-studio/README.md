# GBS Client Report Studio

Agency staff turn a client's monthly platform data into a client-facing
**Monthly Business Review**: an A4-landscape report in the client's brand,
co-branded by Get Bee Seen, exported as a PDF.

`CLAUDE.md` is the product spec. `prototype/gbs-client-report-studio.html` is
the visual and behavioural spec, and `reference/` holds the PDF it exports.

## Status

All five build steps in `CLAUDE.md` are in place.

- **Studio** in the GBS brand: sign-in, dashboard, clients, reports,
  templates, brand assets, settings.
- **Create a report**:
  - Pick the client and month, then enter the Instagram Insights and Meta
    Ads figures and each post, and attach the screenshots. The same
    screenshot uploaded twice is kept once (file hash).
  - **Read figures from screenshots** (Claude) fills the empty fields, each
    marked with a confidence level to check. A screenshot that disagrees
    with a value already typed is shown as a potential data conflict, and
    nothing changes until you choose. A screenshot from a different period
    is flagged.
  - **Start next month** pre-fills the next report, with this month as the
    comparison.
- **Report**: the prototype's pages, in Premium, Minimal or Dark, with the
  client's logo and colours. Long months continue onto extra pages.
- **Report text**: edit, shorten, expand or reset any block, with saved
  versions. **Write with Claude** rewrites every block from the report's
  figures only. A block that mentions a figure not in the data, or claims
  a cause without hedging, is rejected and keeps its current text.
- **Review panel** (staff only): data conflicts with a choice of value,
  warnings, confidence, internal notes, status.
- **Client links**: a private link per report, with an optional password,
  that can be replaced or stopped. The client sees only the report, can
  present it, and can download the PDF.
- **PDF export** rendered server-side by Playwright from the same pages.

Claude features need `ANTHROPIC_API_KEY` on the server. Without it they say
so and everything else works. They call `claude-opus-5-5` with structured
JSON output and Anthropic's server-side refusal fallback; a refusal or API
error leaves the report unchanged.

Not built: Analytics (a placeholder), CSV/XLSX import, and Google Ads or
LinkedIn figures (those pages show "not included").

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
- `ANTHROPIC_API_KEY` (optional): turns on reading screenshots and
  writing with Claude.
- `PUBLIC_URL` (optional): the address used in client links, for example
  `https://reports.getbeeseen.com`.

Production builds refuse to start a session without both. Serve the studio
over HTTPS: the session cookie is Secure in production.

### Deploy

`Dockerfile` builds a production image with Chromium for PDF export:

```bash
docker build -t gbs-report-studio .
docker run -p 3000:3000 -v gbs-data:/app/data \
  -e STUDIO_PASSWORD=... -e SESSION_SECRET=... gbs-report-studio
```

The image is based on Microsoft's Playwright image (Chromium and its system
libraries included), so keep its tag equal to the `playwright` version in
`package.json`. It is about 4.3 GB.

**Render** (simplest): `render.yaml` at the repository root is a Blueprint.
In Render choose New → Blueprint, pick this repository and branch, and enter
a `STUDIO_PASSWORD`. It creates the web service with a 1 GB disk at
`/app/data` and generates `SESSION_SECRET`. The disk needs a paid instance
(Starter). Render serves it over HTTPS.

Any other host that runs a container with a persistent disk works too
(Railway, Fly.io, a small VPS with Docker). Mount the disk at `/app/data` and
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
| `npm test` | Analysis, conflicts, copy, form validation and the grounding check on Claude's text (`node --test`) |
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

Against `reference/` itself, the Chromium version decides the result. The
Docker image (Playwright 1.63's Chromium) reproduces it almost exactly:
0.00–1.15% of pixels per page. An older Chromium (141, used in development
here) spaces glyphs slightly narrower, giving 0.4–3.3% per page, as it also
does for the prototype itself. Run `npm run compare` with the same Chromium
that produced the PDF, or its prototype baseline will differ in the same way.

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
