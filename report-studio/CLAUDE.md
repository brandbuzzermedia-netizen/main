# GBS Client Report Studio

> **Decision (Oct 2026): no Supabase.** Mehul does not want Supabase. Storage is a JSON file on
> the server (`src/lib/data/repo.ts`) and sign-in is a shared studio password with a signed cookie
> (`src/lib/auth/session.ts`). Where this spec says Supabase, Postgres, RLS or signed storage URLs,
> build on those instead, and ask before adding a database or auth service. README.md has the current state:
> all five build steps are implemented; Claude features need ANTHROPIC_API_KEY.
>
> **Decision (Oct 2026): multi-client.** GBS has many clients in different industries. Nothing may assume
> Thrishank Doors (sample data only) or a messaging campaign: client details and branding come from the
> client profile, Meta wording from the result type (`src/lib/report/results.ts`), and pages without data
> are left out rather than shown empty (this replaces the "one-line note" rule below for new reports).
> Files live under `data/files/<client>/<month-yyyy>/<platform>/`. Every AI call is scoped to one client.

Production build of a SaaS web app for **Get Bee Seen (GBS)**, a digital marketing agency (owner: Mehul, Bengaluru).
Agency staff upload raw monthly data (platform screenshots, CSV/XLSX, social URLs, client branding) and the app produces a
polished, client-facing **Monthly Business Review** as an A4-landscape PDF, shareable link and presentation mode.

`prototype/gbs-client-report-studio.html` is a working single-file front-end prototype (vanilla JS, no backend). It is the
**visual and behavioural spec**. Open it in a browser first (click "Enter studio"). `reference/` holds the PDF it exports.
Port it to the stack below; do not redesign it.

## Stack
Next.js (App Router) + React + TypeScript + Tailwind + shadcn/ui, Recharts for in-app charts, Supabase (Postgres, Auth,
Storage with signed URLs, RLS), Playwright for server-side PDF, a vision-capable Claude model for screenshot extraction and
report writing (Anthropic API, server-side only).

## Non-negotiable rules (from the product spec)
1. **Screenshots are the source of truth. Never fabricate metrics.** Unavailable metric -> show "Not available in uploaded data".
2. Separate **Data / Observation / Interpretation / Action** in generated copy. Insufficient evidence -> "Insufficient data to determine."
3. Never claim sales/revenue unless the client supplied it. Never infer causality for creative performance; hedge as
   "Likely contributing factors based on available data".
4. Detect duplicate screenshots and inconsistent date ranges. On conflicting numbers, **do not silently pick one**: show
   "Potential data conflict detected" and let the user choose (prototype: follower growth 7.4% reported vs 7.2% calculated).
5. Month-over-month only when previous-month data exists: ((cur - prev) / prev) x 100. Cost metrics invert good/bad colouring.
6. Public Instagram data is not Insights. Never imply a URL gives private Insights.
7. Keep a confidence level (high/medium/low) per generated insight. Show warnings to the admin only, never to the client.
8. Internal notes never render in client reports.

## Branding (two brands on every report)
- **App chrome = GBS brand.** Deep green `#196144`, gold `#FFB933`, cream `#FFF2DC`, sage `#3E5D48`, ink `#191816`/`#262626`, grey `#999`.
  Headings **Baloo 2** (600/700/800), body **Poppins**. Rounded, pill buttons, hex texture on green (`--hex` in the prototype CSS).
  Logos in `assets/` (stacked white for green backgrounds, horizontal green for light, bee icon small, badge circle).
  Do not stretch the bee; use it small. Prototype trimmed 2 stray top pixel rows off `logo_stacked_white.png`; do the same.
- **Reports = client brand leads, GBS co-brands.** Client logo/colours dominate (cover, headers, numerals). GBS appears on every
  page: top-right lockup (bee + "Get Bee Seen"), footer "Prepared by Get Bee Seen", cover "Prepared by" credit, thank-you page.
  Report typography: **Poppins** throughout (Oct 2026 decision; `src/components/report/report-type.css`, arrows from Baloo 2).
  The prototype's Instrument Serif + Hanken Grotesk are kept only for the reference comparison. Derive an elegant palette from the client logo if
  none supplied (prototype `derivePalette`). Demo client palette (Thrishank Doors) is a placeholder: walnut `#3B2A21`, brass `#C9974A`.
- Three templates: Premium (editorial), Minimal (white), Dark. Client colours layer on top.

## Report format
Page = **1122x794 px** (A4 landscape at 96dpi), print CSS `@page{size:A4 landscape;margin:0}`, pages 793px tall in print to avoid
blank pages. Preview scales pages with a CSS var `--s`. Server PDF via Playwright `page.pdf` with `printBackground`,
`preferCSSPageSize`, embedded fonts (Poppins, Baloo 2). Document title: "<Client> – Monthly Performance Report – <Month> – Get Bee Seen".
Page order (modules toggle on/off): Cover, Executive summary, What we worked on, Content calendar, Instagram performance,
Content performance matrix (sortable), Content breakdown cards (2/page), Top performing (by views, engagement, shares, saves,
reach, comments, follower conversion), Content insights (themes, worked/didn't/test), Paid overview, Campaign performance,
Paid insights (DOAI), Organic+paid combined (funnel with missing stages shown as unavailable), Business impact, Month-over-month,
Source screenshots (Instagram, Meta/other, 2 per page, large), Recommendations, Action plan, Next month focus, Thank you.
Empty modules render a one-line note ("Meta Ads data was not included in this report."), never an empty page.

## What the prototype fakes (replace with real implementations)
| Prototype | Build |
|---|---|
| Extraction is simulated; Thrishank August 2026 dataset is hard-coded | Vision-model extraction per screenshot, OCR fallback, structured JSON, per-field confidence, "Retry analysis" / "Enter data manually" |
| Per-piece Instagram metrics other than the top Reel and all captions beyond it are **sample** | Real extraction; content covers are placeholders until real cover images are uploaded/extracted |
| Text generators in `G` are rule-based templates | Claude writes Data/Observation/Interpretation/Action from the confirmed numbers only; keep the prototype templates as fallbacks and as the prompt-grounding examples |
| Share link is a fake URL; no auth | `app.getbeeseen.com/report/<client>/<month>`, optional password, signed URLs, client viewer role, agency-scoped RLS |
| Export = browser print | Server-side Playwright PDF + download; also keep browser print as fallback |
| Single in-memory state | Supabase tables below; report versioning |
| Edit/Regenerate/Shorten/Expand are local string ops | Server calls; store edits per block; "Regenerate analysis" creates a new `report_versions` row |

## Data model (Postgres)
users, clients, client_brand_assets, reports, report_sections, platforms, uploads, extracted_metrics (value, unit, source_upload_id,
confidence, conflict_group, user_confirmed), social_posts, social_post_metrics, campaigns, campaign_metrics, insights (type, text,
confidence, evidence jsonb), recommendations, report_versions, internal_notes. Every row scoped by `agency_id`; RLS so an agency only
sees its own clients/reports; clients only see reports shared with them; storage bucket private with signed URLs.

## Map prototype -> modules to extract
`analyze()` -> `lib/analysis.ts` (pure, unit-test it: top-by metrics, themes, engagement rate = (likes+comments+shares+saves)/reach, ratings vs average views).
`G` / `T` / `gen` -> `lib/copy/*` (variants, shorten, expand). `buildPages()` + `pageHTML()` -> React report components, one per page.
`dataForm()` -> Review step. `matrixHTML`, `contentCard`, `barsV`, `donut`, `hbars`, `delta`, `coverArt` -> components.
`mockShot`/`shotsFor` -> real screenshot gallery. Present mode (arrows/space/Esc) and calendar (Mon-first grid) port as-is.

## Build order
1. Scaffold Next.js + Tailwind + shadcn, GBS theme tokens, auth, agency/client CRUD, Supabase schema + RLS.
2. Port the report renderer with the demo dataset as a seed fixture; match `reference/` PDF pixel-for-pixel; Playwright PDF route.
3. Upload pipeline (drag/drop, bulk, dedupe by hash) + extraction + review/conflict UI.
4. Claude-written analysis with grounding + confidence; edit tools; versions.
5. Sharing, password, present mode, duplicate-previous-month, templates, brand assets.
Acceptance: no overflow on any page, no broken images, PDF identical to preview, every number traceable to a source screenshot.
