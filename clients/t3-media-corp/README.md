# T3 Media Corp

Website for **T3 Media Corp** — a supplier of interior and architectural
materials on Begur Road, Bommanahalli, Bengaluru. Next.js 14 App Router,
TypeScript and Tailwind, exported as a fully static site.

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # static export into out/
```

`npm run build` writes `out/`, which is plain HTML, CSS and JS — deployable to
any static host (Netlify, Vercel, Cloudflare Pages, S3, or Apache/Nginx).

## Pages

| Route | Page |
| --- | --- |
| `/` | Home — hero, category grid, featured materials, why T3, applications, location, CTA |
| `/products/` | Catalogue with category filtering |
| `/products/<slug>/` | One page per product, generated from `src/data/products.ts` |
| `/applications/` | The range read by space rather than by material |
| `/about/` | Who T3 is, what it offers, who it serves, where it is |
| `/contact/` | Enquiry form, contact details, map |

Eleven product routes are generated: `alabaster-sheets`, `acrylic-laminates`,
`wpc-doors`, `acrylic-mirror-sheets`, `acrylic-plexiglass-sheets`,
`digital-glass`, `wallpapers`, `pvc-ply-sheets`, `wpc-vascal-frames`, `acp`
and `cnc-cutting`.

## Adding or editing a product

Everything about a product lives in one object in `src/data/products.ts`. Add
an entry and the route, the mega-menu, the catalogue filter, the footer, the
sitemap and the Product JSON-LD all pick it up — there is nothing else to wire.

```ts
{
  name, slug, category, shortDescription, positioning,
  overview: string[],                 // 2–3 paragraphs
  features: { title, body }[],
  applications: string[],
  specifications: { label, value }[], // published figures only
  specNote,                           // shown when the data is incomplete
  faq: { q, a }[],                    // also emitted as FAQPage JSON-LD
  plate, gallery, seoTitle, seoDescription, featured?
}
```

Company facts — address, phone, WhatsApp number, email, hours, map — live in
`src/data/site.ts` and are used everywhere. Change them in one place.

## Brand mark

`public/brand/t3-mark.png` is the client's own logo — the cyan disc with the T3
monogram. It is the only place the cyan appears; everything else is the neutral
palette, so the mark stays the brightest thing on the page. The same file is
the favicon (`src/app/icon.png`) and the Apple touch icon. Replacing those three
files is the whole of a logo change.

## Type

| Role | Face | Where |
| --- | --- | --- |
| Display | **Bodoni Moda** | Headlines, product names, pull quotes |
| Text | **Manrope** | Body copy, navigation, form fields |
| Label | **JetBrains Mono** | Eyebrows, buttons, specs, counters, indices |

All three are loaded through `next/font/google`, so they are self-hosted,
preloaded and subset at build time — no network call to Google at runtime.
Bodoni Moda carries the optical-size axis, which is why a 92px hero and a 24px
sub-head can share one family without the hairlines disappearing.

## The loading screen

Ink ground, the brand mark inside a breathing ring, a hairline progress rule and
a mono counter; on completion the curtain splits and lifts off the page.

- Runs **once per session** — `sessionStorage` remembers it, so moving between
  pages never re-gates the site.
- Two safety timers (3.6s and 6s) guarantee it clears even if an asset stalls.
- Skipped entirely under `prefers-reduced-motion`, and it is client-only, so the
  HTML a crawler receives is the page itself.

It lives in `src/components/SiteLoader.tsx`.

## Motion

No animation library — every effect below is CSS plus a small observer, which
keeps the shared JS bundle at ~87 kB.

| Effect | Component | Notes |
| --- | --- | --- |
| Word-by-word headline reveal | `WordReveal` | Words stay real text nodes; a crawler reads the sentence as written |
| Scroll reveal / stagger | `Reveal` | One `IntersectionObserver` per element, disconnected after firing |
| Image curtain | `Reveal variant="plate"` | Clip-path uncovers the plate as it arrives |
| Parallax drift | `Parallax` | rAF-throttled, only while on screen, decorative layers only |
| Route fade | `PageTransition` | Opacity only — see the note below |
| Range marquee | `.marquee-track` | Duplicated list, pauses on hover, `sr-only` text for readers |

Two things worth keeping in mind before extending any of it:

- **Never put a transform on `PageTransition`.** A transform — even one that
  resolves to the identity matrix under `animation-fill-mode: both` — makes the
  wrapper the containing block for every `position: fixed` descendant, which
  strands the sticky mobile CTA bar thousands of pixels down the page.
- **Never clip the element an observer is watching.** A `clip-path` on the
  observed element zeroes its intersection rect, so the reveal never fires. The
  clip belongs on the image inside the wrapper.

Every hidden-by-default state is gated on `html.js` (set by a one-line inline
script in the layout), so with JavaScript off nothing is invisible. The whole
system is neutralised by the `prefers-reduced-motion` block in `globals.css`.

## Content rule

Factual claims trace back to T3 Media Corp's existing website (product range,
the six strengths, alabaster's 100+ designs / 2mm–10mm / waterproof, acrylic
mirror's 2mm–5mm, digital glass's 100+ designs, WPC's waterproof and
termite-proof properties, exterior vs interior ACP). Nothing else is asserted.

Where the existing site publishes no figures, `specNote` says so and is prefixed
`PLACEHOLDER` — grep for it. No certifications, awards, years in business,
client counts, testimonials or invented specifications appear anywhere.

Two other items are marked `PLACEHOLDER` in `src/data/site.ts`: `url` (set it
to the final domain before launch, since canonicals, OG tags and the sitemap
are built from it) and `mapsEmbed` (swap for the client's own Google Business
Profile embed so the pin lands on the showroom door).

## Imagery

`public/plates/*.svg` are **designed material studies, not photographs**. The
client's product photography was not available when this was built, so each
plate is an abstract study of how the material behaves — deliberately abstract
so nobody mistakes it for a photo of real stock. They are generated by:

```bash
python3 tools/make_plates.py
```

To switch to real photography, drop files with the same base names into
`public/plates/` and change `PLATE_EXT` in `src/components/MaterialPlate.tsx`
(e.g. to `webp`). No other code changes are needed.

## Previewing on a host that is not a domain root

`out/` references its assets absolutely (`/_next/...`, `/plates/...`), which is
correct for a normal static host but breaks anywhere the site is served under a
sub-path — every asset resolves above the site root and 404s, leaving unstyled
HTML. For those hosts:

```bash
npm run build
python3 tools/make_preview.py out preview
```

That writes a flat, fully-relative copy: one file per page at the root, assets
referenced relatively, `_next/` renamed (some hosts reserve a leading `_`),
`@font-face` URLs rewritten, and a capture-phase click handler that turns
navigation into plain page loads — Next's `<Link>` reads its href from the
hydration payload rather than the DOM, so without it the router pushes the
original absolute routes back. `out/` is untouched and stays canonical.

Test any such preview from a sub-path, not from `/` — serving it at a domain
root hides exactly the bug it is meant to fix.

## Lead capture

WhatsApp is the primary channel. `src/lib/whatsapp.ts` builds `wa.me` links with
the message pre-filled, and product pages pass the product name through, so an
enquiry arrives already saying what it is about:

> Hi T3 Media Corp, I am interested in your Alabaster Sheets. Please share the
> details and pricing.

The site is a static export, so there is no server to post the contact form to.
Rather than ship a form that silently goes nowhere, `ContactForm` composes the
fields into a WhatsApp message with a `mailto:` fallback. To add a hosted
endpoint later, POST `fields` from `handleSubmit` and keep WhatsApp as the
secondary action.

Mobile shows a sticky **WhatsApp | Call | Get Quote** bar; tablet and desktop
get a floating WhatsApp button after the first scroll.

## SEO

Per-page titles (≤60 chars) and meta descriptions (≤155), canonicals, Open
Graph, a generated `sitemap.xml` and `robots.txt`, and JSON-LD for
`HomeGoodsStore` (with opening hours and an offer catalogue), `Product`,
`FAQPage`, `BreadcrumbList` and `ItemList`.

## Checks run against the build

Static export served locally and driven with Chromium:

- every internal link resolves (no 404s)
- one `<h1>` per page, no heading-level jumps
- every `<img>` has alt text and loads
- no horizontal overflow at 390px
- every text node clears WCAG AA contrast (checked computed colours, not tokens)
- mega menu, mobile drawer (open, Escape, scroll lock), catalogue filter and
  contact-form validation all behave
- no console errors

The only network request that fails locally is the Google Maps iframe, which is
blocked by this environment's egress policy and works in production.
