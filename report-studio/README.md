# GBS Client Report Studio

Agency staff turn a client's monthly platform data into a client-facing
**Monthly Business Review**: an A4-landscape report in the client's brand,
co-branded by Get Bee Seen, exported as a PDF.

`CLAUDE.md` is the product spec. `prototype/gbs-client-report-studio.html` is
the visual and behavioural spec, and `reference/` holds the PDF it exports.

## Two ways to run it

- **Browser-only (`static/`)**: plain files for any static host, such as a
  Hostinger subdomain. No server; reports are saved in the browser, PDFs are
  built in the browser, and Claude works with an API key saved in Settings.
  This is the version GBS uses internally. See `static/README.md`.
- **Server (this Next.js app)**: shared data on one server, Playwright PDFs
  and client share links. Needs a Node.js host (see Deploy below).

## Status

All five build steps in `CLAUDE.md` are in place, and the studio is a
**multi-client** report generator: one report engine, any number of clients,
added from the studio with no code change. Thrishank Doors is only the
sample client the store starts with.

- **Clients**: each has its own profile (client and company name, industry,
  location, contact, website, Instagram, Facebook, internal notes, report
  design) and branding (logo, primary and secondary colour, cover image).
  Every report reads the profile at render time, so the logo, colours,
  company name, handles and website on the report are always that client's.
- **Dashboard**: every client with their latest report and its status, the
  client, created-this-month and pending counts, and **+ Add client** /
  **+ Create report**. A client's page shows their profile and their own
  report history grouped by year, with **+ Create monthly report** and
  **Start next month**.
- **One report per client per month** (id `<client>-<yyyy-mm>`).
- **Start next month** copies branding, template, pages, campaign, result
  type and action plan, carries this month's figures as the previous month,
  and starts every figure, post and screenshot empty. **Duplicate report**
  copies the figures and posts into another month of the same client (never
  the screenshots) and is flagged in the review panel until replaced.
- **Copy follows the data**: Meta results have a type (messaging
  conversations, leads, calls, link clicks, landing page views, purchases,
  other), and every label and sentence about paid results uses it. A month
  without enquiry-type results leads with reach and engagement instead.
- **Pages without data are left out**: no Meta Ads data means no paid pages;
  no post list means no calendar or per-post pages; an Instagram engagement
  page appears when accounts engaged or interaction totals are entered.
- **Isolation**: screenshots are stored in the client's own folders, a report
  only shows files from its client's folders, Claude's requests name the one
  client, report and month, extraction warns when screenshots show another
  account, and Claude's text is rejected if it names another client.
- **PDF name**: `<Client_Name>_<Month>_<Year>_Monthly_Performance_Report.pdf`,
  e.g. `Wudgres_September_2026_Monthly_Performance_Report.pdf` (every word of
  the client name is kept, so "Thrishank Doors" gives `Thrishank_Doors_…`).

- **Studio** in the GBS brand: sign-in, dashboard, clients, reports,
  templates, brand assets, settings.
- **Create a report**:
  - Pick the client and month, then enter the Instagram Insights figures
    (followers at start and end, reach, views/impressions, accounts engaged,
    likes, comments, shares, saves, posts, Reels, stories) and Meta Ads
    figures (campaign, objective, result type, spend, results, impressions,
    reach, clicks, CTR/CPC/CPM when clicks are not shown), each post if you
    have them, and attach the screenshots. Net follows, CTR, CPC, CPM and
    cost per result are calculated. The same
    screenshot uploaded twice is kept once (file hash).
  - **Read figures from screenshots** (Claude) fills the empty fields, each
    marked with a confidence level to check. A screenshot that disagrees
    with a value already typed is shown as a potential data conflict, and
    nothing changes until you choose. A screenshot from a different period
    is flagged.
  - **Start next month** pre-fills the next report, with this month as the
    comparison.
- **Report**: the prototype's pages, in Premium, Minimal or Dark, with the
  client's logo and colours, set in Poppins (`report-type.css`). Long months continue onto extra pages.
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
logos in `data/files/`, one folder per client:

```text
data/files/
  wudgres/
    brand/                  logo, cover image
    september-2026/
      instagram/
      meta-ads/
  lykes/
    september-2026/
      instagram/
```

Files are served to signed-in staff, and to a client's share link through
signed, expiring per-file addresses. Deleting a client deletes its folder.
The JSON file is created on first run with one sample client (Thrishank
Doors, August 2026); delete it to start again. Writes are queued and atomic (temporary file, then rename). This
suits one server with a persistent disk. Back the file up like any other
business record. It is not shared between servers, and it is not in git
(`data/` is ignored).

## Checks

| Command | What it checks |
| --- | --- |
| `npm test` | Analysis, conflicts, copy, form validation, result-type wording, next month and duplicate, and the grounding check on Claude's text (`node --test`) |
| `scripts/acceptance/` | Three-client acceptance test (Thrishank, Wudgres, Lykes) through the real UI and PDFs; see the header of `acceptance.mjs` |
| `npm run typecheck` | TypeScript |
| `npm run build` | Production build |
| `STUDIO_PASSWORD=… npm run compare -- --fetch http://127.0.0.1:3000` | Exports the demo report and compares it page by page with the prototype and the reference PDF (needs `pdftoppm`) |

### PDF fidelity

Reports are set in Poppins (`src/components/report/report-type.css`), not
the prototype's Instrument Serif and Hanken Grotesk. `npm run compare`
applies the same type styles to the prototype, exports it through the same
Playwright pipeline, and compares pixels at 96 dpi, so it still checks the
layout page by page. Current result: **21 of 23 pages are pixel-identical**
to the prototype, every
number on every page matches `reference/`, and page count (23) and paper
size (841.92 × 595.92 pt) match.

The two pages that differ do so on purpose. The prototype gives the
"Top performing on views" pill the class `top`, which its print CSS also
uses to hide the studio header, so the pill vanishes from its PDF. The port
shows it (content breakdown, pages 7 and 8).

Against `reference/` itself, pixels now differ by 1.5–7% per page because
the fonts changed; the numbers still match exactly. Before the font change,
the Chromium version decided the result. The
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
