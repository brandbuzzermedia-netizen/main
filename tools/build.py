#!/usr/bin/env python3
"""
Build the Get Bee Seen site.

Writes the six static pages from one shared shell so the header, footer and
<head> stay identical everywhere, and also writes a single-file preview
build (preview.html) with all pages bundled for sharing a link.

    python3 tools/build.py
"""

import base64
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

NAV = [
    ("index.html",    "Home"),
    ("about.html",    "About"),
    ("work.html",     "Our Work"),
    ("services.html", "Services"),
    ("process.html",  "Process"),
    ("contact.html",  "Contact"),
]

ARROW = ('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
         'stroke-width="3" stroke-linecap="round" stroke-linejoin="round">'
         '<path d="M5 12h14M13 6l6 6-6 6"/></svg>')


# ----------------------------------------------------------------------
# shared chunks
# ----------------------------------------------------------------------

def head(page):
    return f'''<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{page["title"]}</title>
<meta name="description" content="{page["desc"]}">
<meta name="theme-color" content="#fff2dc">

<meta property="og:type" content="website">
<meta property="og:title" content="{page["title"]}">
<meta property="og:description" content="{page["desc"]}">

<link rel="icon" href="assets/badge.svg">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Archivo:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles.css">'''


LOADER = '''<div class="loader" id="loader" role="status" aria-live="polite" aria-label="Loading Get Bee Seen">
  <div class="loader__inner">
    <div class="loader__disc">
      <img class="loader__bee" src="assets/bee.svg" alt="" aria-hidden="true">
    </div>

    <img class="loader__wordmark" src="assets/wordmark-cream.svg" alt="Get Bee Seen">
    <p class="loader__status" id="loaderStatus">Loading</p>

    <div class="loader__bar"><i id="loaderBar"></i></div>
    <div class="loader__pct" id="loaderPct">0%</div>
  </div>
</div>'''


def header(active):
    items = []
    for href, label in NAV:
        state = ' class="is-active" aria-current="page"' if href == active else ''
        items.append('<a href="%s"%s>%s</a>' % (href, state, label))
    links = "\n      ".join(items)
    return f'''<header class="header" id="header">
  <div class="wrap header__row">
    <a href="index.html" class="brand" aria-label="Get Bee Seen — home">
      <img src="assets/badge.svg" alt="Get Bee Seen">
    </a>

    <nav class="nav" id="nav">
      {links}
    </nav>

    <a href="contact.html" class="btn btn--yellow btn--sm">Start a project</a>

    <button class="nav-toggle" id="navToggle" aria-label="Toggle menu" aria-expanded="false" aria-controls="nav">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
    </button>
  </div>
</header>'''


CTA = f'''<section class="cta">
  <div class="wrap cta__inner reveal">
    <img class="cta__badge" src="assets/badge.svg" alt="" aria-hidden="true">
    <h2>Let's make your brand<br>impossible to ignore.</h2>
    <p>Tell us what you're building. We'll come back with where the attention is leaking and what we'd do about it.</p>
    <a href="contact.html" class="btn btn--green">Start a project {ARROW}</a>
  </div>
</section>'''


FOOTER = '''<footer class="footer">
  <div class="wrap">
    <div class="footer__grid">
      <div>
        <a href="index.html" class="brand" aria-label="Get Bee Seen — home">
          <img class="footer__logo" src="assets/wordmark-yellow.svg" alt="Get Bee Seen">
        </a>
        <p>A branding, web and performance marketing agency in Bengaluru, buzzing brands into the spotlight.</p>
      </div>

      <div>
        <h4>Services</h4>
        <ul>
          <li><a href="services.html#brand">Brand &amp; creative</a></li>
          <li><a href="services.html#growth">Digital &amp; growth</a></li>
          <li><a href="work.html#ads">Performance marketing</a></li>
          <li><a href="work.html#identity">Brand identity</a></li>
        </ul>
      </div>

      <div>
        <h4>Company</h4>
        <ul>
          <li><a href="about.html">About</a></li>
          <li><a href="work.html">Our Work</a></li>
          <li><a href="services.html">Services</a></li>
          <li><a href="process.html">Process</a></li>
          <li><a href="contact.html">Contact</a></li>
        </ul>
      </div>

      <div>
        <h4>Get in touch</h4>
        <ul>
          <li><a href="mailto:info@getbeeseen.com">info@getbeeseen.com</a></li>
          <li><a href="tel:+918147452427">+91 81474 52427</a></li>
          <li><span class="footer__addr">JP Nagar 7th Phase,<br>Bengaluru 560078</span></li>
        </ul>
      </div>
    </div>

    <div class="footer__bottom">
      <span>© <span class="js-year">2026</span> Get Bee Seen. All rights reserved.</span>
      <div class="socials">
        <a href="https://www.facebook.com/profile.php?id=61558586039153" target="_blank" rel="noopener" aria-label="Get Bee Seen on Facebook">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.5-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.45 2.91h-2.33V22c4.78-.76 8.44-4.92 8.44-9.94z"/></svg>
        </a>
        <a href="https://www.instagram.com/getbeeseen/" target="_blank" rel="noopener" aria-label="Get Bee Seen on Instagram">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.6" cy="6.4" r="1.3" fill="currentColor" stroke="none"/></svg>
        </a>
        <a href="https://www.linkedin.com/company/get-bee-seen/" target="_blank" rel="noopener" aria-label="Get Bee Seen on LinkedIn">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM10 9h3.8v1.7h.05A4.2 4.2 0 0 1 17.6 8.7c4 0 4.7 2.6 4.7 6V21h-4v-5.5c0-1.3 0-3-1.9-3s-2.1 1.4-2.1 2.9V21h-4z"/></svg>
        </a>
        <a href="https://x.com/GetBeeSeen" target="_blank" rel="noopener" aria-label="Get Bee Seen on X">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.53 3h2.97l-6.49 7.41L21.75 21h-5.97l-4.67-6.1L5.75 21H2.78l6.94-7.93L2.25 3h6.12l4.22 5.58zm-1.05 16.2h1.65L7.6 4.71H5.83z"/></svg>
        </a>
        <a href="https://www.threads.com/@getbeeseen" target="_blank" rel="noopener" aria-label="Get Bee Seen on Threads">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.6 21.2c-5.1 0-8.1-3.4-8.1-9.2S7.5 2.8 12.6 2.8c3.4 0 5.9 1.6 7 4.3"/><path d="M9.2 9.9c.8-1.2 2-1.7 3.3-1.6 2 .2 3.1 1.4 3.3 3.6.2 1.8-.1 3.2-.9 4.2-.8 1-2 1.5-3.3 1.4-1.5-.1-2.5-1-2.5-2.2 0-1.3 1.2-2.1 3.1-2.2 2.8-.2 4.9.9 5.8 2.7.8 1.6.3 3.6-1.1 4.9"/></svg>
        </a>
      </div>
    </div>
  </div>
</footer>'''


def page_hero(kicker, title, lede, extra=""):
    return f'''<section class="page-hero">
  <div class="wrap page-hero__inner">
    <span class="kicker">{kicker}</span>
    <h1>{title}</h1>
    <p class="lede">{lede}</p>
    {extra}
  </div>
</section>'''


# ----------------------------------------------------------------------
# content — all copy, figures and client work come from the
# Get Bee Seen agency portfolio (2026).
# ----------------------------------------------------------------------

TAGLINE = "Buzzing brands into the spotlight"

STAGES = [
    ("01", "Attention",
     "In a feed that never stops scrolling, invisible brands lose by default. We design "
     "the first three seconds — the ones that decide whether someone stops or swipes past."),
    ("02", "Trust",
     "Attention without credibility fades fast. Consistent identity, clear messaging and a "
     "website that looks as good as your service turn a first glance into belief."),
    ("03", "Conversion",
     "Trust means nothing if it doesn't lead anywhere. Every page, ad and funnel we build is "
     "engineered around one question: does this move someone to act?"),
    ("04", "Growth",
     "Visibility that doesn't compound is a campaign, not a business. We build the systems — "
     "SEO, retention, data — that keep the momentum after the launch buzz fades."),
]

PHILOSOPHY = '''<section class="section" id="philosophy">
  <div class="wrap">
    <div class="section__head reveal">
      <span class="kicker">Our philosophy</span>
      <h2>Why most brands stay invisible</h2>
      <p>Most agencies stop at pretty. We work through four stages that turn a brand from
        overlooked into unmissable.</p>
    </div>

    <div class="steps">
''' + "\n".join(f'''      <article class="step reveal">
        <b>{n}</b>
        <div><h3>{name}</h3><p>{body}</p></div>
      </article>''' for n, name, body in STAGES) + '''
    </div>
  </div>
</section>'''


# --- services -------------------------------------------------------

BRAND_SERVICES = [
    ("01", "Brand Strategy", "Positioning, voice and a story worth repeating.",
     "Positioning · Messaging · Naming",
     '<path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="5"/>'),
    ("02", "Brand Identity", "Logos and systems built to be recognised, not just seen.",
     "Logo · Colour · Typography",
     '<circle cx="13.5" cy="6.5" r="2.5"/><circle cx="19" cy="13" r="2.5"/><circle cx="6" cy="12" r="3"/><path d="M12 21a9 9 0 1 1 9-9"/>'),
    ("03", "Creative Production", "Design assets tuned for every platform you show up on.",
     "Campaign Design · Social Assets",
     '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 15l5-5 4 4 3-3 6 6"/>'),
    ("04", "Photography", "Product and lifestyle imagery that carries the brand's tone.",
     "Product · Lifestyle · Studio",
     '<path d="M3 8h3l2-3h8l2 3h3v11H3z"/><circle cx="12" cy="13" r="4"/>'),
    ("05", "Video Production", "Short-form and brand films made to stop the scroll.",
     "Reels · Brand Films · Edits",
     '<path d="m22 8-6 4 6 4V8z"/><rect x="2" y="6" width="14" height="12" rx="2"/>'),
    ("06", "Influencer Marketing", "Creator partnerships that put your brand in front of trust.",
     "Sourcing · Campaigns · UGC",
     '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/>'),
]

GROWTH_SERVICES = [
    ("07", "Website Design", "Interfaces built around how your customer actually decides.",
     "UI · UX · Prototype",
     '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>'),
    ("08", "Web Development", "Fast, reliable builds on the stack your business needs.",
     "Custom Builds · CMS · E-commerce",
     '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 4l-4 16"/>'),
    ("09", "Performance Marketing", "Paid media managed against revenue, not reach.",
     "Meta Ads · Lead Gen · Reporting",
     '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-4 4"/>'),
    ("10", "SEO", "Organic visibility that keeps paying you back.",
     "Technical SEO · Content · Local",
     '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    ("11", "Social Media", "Always-on content that builds a following, not just likes.",
     "Strategy · Content · Community",
     '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.2A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/>'),
    ("12", "AI Automation", "Smarter workflows for lead handling, support and reporting.",
     "Chatbots · Workflows · Reporting",
     '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M9 14h.01M15 14h.01"/>'),
]


def service_cards(items):
    out = []
    for num, name, desc, tags, icon in items:
        out.append(f'''      <article class="card reveal">
        <div class="card__top">
          <div class="card__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">{icon}</svg></div>
          <span class="card__num">{num}</span>
        </div>
        <h3>{name}</h3>
        <p>{desc}</p>
        <span class="card__tags">{tags}</span>
      </article>''')
    return "\n".join(out)


SERVICE_GROUPS = f'''<section class="section section--white" id="brand">
  <div class="wrap">
    <div class="section__head reveal">
      <span class="kicker">Brand &amp; creative</span>
      <h2>Made to be remembered</h2>
      <p>The half of the work that decides whether anyone stops scrolling.</p>
    </div>
    <div class="cards">
{service_cards(BRAND_SERVICES)}
    </div>
  </div>
</section>

<section class="section" id="growth">
  <div class="wrap">
    <div class="section__head reveal">
      <span class="kicker">Digital &amp; growth</span>
      <h2>Built to bring in revenue</h2>
      <p>The half that turns attention into enquiries, orders and repeat customers.</p>
    </div>
    <div class="cards">
{service_cards(GROWTH_SERVICES)}
    </div>
  </div>
</section>'''


# --- numbers --------------------------------------------------------

def numbers(bg="green"):
    rows = [
        ("100", "%", "Client retention"),
        ("50", "+", "Websites built"),
        ("50", "+", "Brand identities"),
        ("100", "+", "Campaigns executed"),
        ("100", "+", "Projects delivered"),
        ("100", "K+", "Ad spend managed (₹)"),
        ("5000", "+", "Leads generated"),
        ("20", "+", "Brands served"),
    ]
    tiles = "\n".join(
        f'      <div class="num"><b data-count="{v}" data-suffix="{s}">0</b><span>{label}</span></div>'
        for v, s, label in rows)
    return f'''<section class="section section--{bg}">
  <div class="wrap">
    <div class="section__head section__head--center reveal">
      <span class="kicker">By the numbers</span>
      <h2>Performance-driven digital growth</h2>
    </div>

    <div class="numbers numbers--8 reveal">
{tiles}
    </div>
  </div>
</section>'''


# --- differentiators & industries -----------------------------------

APART = '''<section class="section section--white">
  <div class="wrap">
    <div class="section__head reveal">
      <span class="kicker">The difference</span>
      <h2>What sets us apart</h2>
    </div>

    <div class="cards">
      <article class="card reveal">
        <div class="card__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg></div>
        <h3>Full-service digital partner</h3>
        <p>Branding, websites, SEO, performance marketing and social — under one roof, on one plan.</p>
      </article>
      <article class="card reveal">
        <div class="card__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-4 4"/></svg></div>
        <h3>Results-first approach</h3>
        <p>Every campaign is measured by leads, revenue and ROI — not vanity metrics.</p>
      </article>
      <article class="card reveal">
        <div class="card__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg></div>
        <h3>Fast, dedicated team</h3>
        <p>A senior team on every account, built for fast turnaround without cutting corners.</p>
      </article>
      <article class="card reveal">
        <div class="card__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21V9l9-6 9 6v12"/><path d="M9 21v-7h6v7"/></svg></div>
        <h3>Industries we know</h3>
        <p>Real estate, manufacturing, healthcare, luxury, interiors and retail — we've shipped in all of them.</p>
      </article>
    </div>
  </div>
</section>'''


INDUSTRIES = ["Real Estate", "Manufacturing", "Healthcare", "Luxury",
              "Interiors", "Retail", "Construction", "Hospitality"]

INDUSTRIES_BLOCK = '''<section class="section">
  <div class="wrap">
    <div class="section__head section__head--center reveal">
      <span class="kicker">Industries we know</span>
      <h2>Where we've already done the learning</h2>
      <p>We've shipped brands, sites and campaigns across all of these — so you're not paying
        for us to work out how your market behaves.</p>
    </div>

    <div class="pills reveal">
''' + "\n".join(f'      <span class="pill-tag">{i}</span>' for i in INDUSTRIES) + '''
    </div>
  </div>
</section>'''


# --- website case studies -------------------------------------------

CASES = [
    {
        "n": "01", "name": "Wudgres", "slug": "wudgres",
        "sector": "Premium Door Manufacturer",
        "url": "wudgres.com",
        "scope": "Website design &amp; development, product catalog, UI &amp; UX",
        "tech": "Webflow · Custom CMS · SEO · Automation",
        "goal": "Convert showroom footfall into online enquiries.",
        "features": ["Interactive product configuration", "Dealer locator map", "Catalog-style product grid"],
        "quote": "The new website experience perfectly represents our brand and has significantly "
                 "improved how customers interact with our products online.",
        "who": "Mahendra Patel, CEO",
    },
    {
        "n": "02", "name": "VMake WPC", "slug": "vmake",
        "sector": "Building Materials — WPC Boards",
        "url": "vmakewpc.com",
        "scope": "Brand website &amp; product specification hub",
        "tech": "Custom CMS · Custom Theme · SEO",
        "goal": "Generate qualified B2B trade enquiries.",
        "features": ["Downloadable spec sheets", "Application-based product finder", "Dealer network page"],
        "quote": "The new platform has made it easier for our customers to understand our products "
                 "and has significantly improved the quality of enquiries we receive.",
        "who": "Vishal Patel, CEO",
    },
    {
        "n": "03", "name": "Healthy Master", "slug": "healthy-master",
        "sector": "Health &amp; Nutrition",
        "url": "healthymaster.in",
        "scope": "D2C storefront design &amp; build",
        "tech": "Shopify · Custom Storefront · Klaviyo",
        "goal": "Lift D2C repeat purchase rate.",
        "features": ["Subscription checkout flow", "Ingredient storytelling pages", "Verified reviews integration"],
        "quote": "The new storefront has elevated our brand experience and significantly improved "
                 "both conversions and repeat customer engagement.",
        "who": "",
    },
    {
        "n": "04", "name": "Crystaline", "slug": "crystaline",
        "sector": "Laminates &amp; Acrylic Brand",
        "url": "crystaline.in",
        "scope": "Corporate website &amp; dealer portal",
        "tech": "Custom CMS · HTML",
        "goal": "Route service leads to the nearest dealer.",
        "features": ["Product comparison tool", "Warranty registration", "Service request form"],
        "quote": "The new platform has simplified how we manage customers, dealers, and service "
                 "requests, making our entire process more efficient.",
        "who": "Ritik Patel, CEO",
    },
    {
        "n": "05", "name": "Pixel Smile Labs", "slug": "pixel-smile",
        "sector": "Dental Technology",
        "url": "pixelsmilelabs.com",
        "scope": "Website design &amp; booking funnel",
        "tech": "Webflow · CRM Integration",
        "goal": "Grow dental-clinic partner sign-ups.",
        "features": ["Case submission portal", "Before / after gallery", "Doctor onboarding flow"],
        "quote": "",
        "who": "Hiten Patel, CEO",
    },
]


def case_blocks(limit=None):
    out = []
    for c in CASES[:limit]:
        feats = "".join(f"<li>{f}</li>" for f in c["features"])
        quote = ""
        if c["quote"]:
            who = f'<cite>{c["who"]}</cite>' if c["who"] else ""
            quote = f'<blockquote class="case__quote">“{c["quote"]}”{who}</blockquote>'
        out.append(f'''    <article class="case reveal">
      <div class="case__art">
        <img src="assets/work/{c["slug"]}.webp" alt="The {c["name"]} website we designed and built" loading="lazy" width="640" height="297">
      </div>

      <div class="case__body">
        <span class="case__n">Case study {c["n"]}</span>
        <h3>{c["name"]}</h3>
        <p class="case__sector">{c["sector"]}</p>

        <dl class="case__meta">
          <dt>Scope</dt><dd>{c["scope"]}</dd>
          <dt>Technology</dt><dd>{c["tech"]}</dd>
          <dt>Business goal</dt><dd>{c["goal"]}</dd>
        </dl>

        <ul class="case__features">{feats}</ul>
        {quote}
        <a class="btn btn--sm" href="https://{c["url"]}" target="_blank" rel="noopener">
          Visit {c["url"]}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg>
        </a>
      </div>
    </article>''')
    return "\n\n".join(out)


def case_preview():
    """Compact cards for the home page."""
    out = []
    for c in CASES[:3]:
        out.append(f'''      <article class="work reveal">
        <div class="work__thumb">
          <img src="assets/work/{c["slug"]}.webp" alt="The {c["name"]} website" loading="lazy" width="640" height="297">
        </div>
        <div class="work__body">
          <h3>{c["name"]}</h3>
          <p class="work__sector">{c["sector"]}</p>
          <p>{c["goal"]}</p>
          <div class="tags"><span class="tag">{c["tech"].split(" · ")[0]}</span><span class="tag">{c["tech"].split(" · ")[1]}</span></div>
        </div>
      </article>''')
    return "\n".join(out)


BRAND_WORK = '''<section class="section section--white" id="identity">
  <div class="wrap">
    <div class="section__head reveal">
      <span class="kicker">Selected work</span>
      <h2>Brand identity</h2>
      <p>Logos and identity systems built to be recognised across every place a brand shows up.</p>
    </div>

    <div class="gallery">
''' + "\n".join(
    f'      <figure class="gallery__item reveal"><img src="assets/work/branding-{i}.webp" '
    f'alt="Brand identity work by Get Bee Seen" loading="lazy" width="640" height="360"></figure>'
    for i in range(1, 5)) + '''
    </div>
  </div>
</section>'''


# --- meta ads case studies ------------------------------------------

ADS = [
    {
        "n": "01", "name": "Wudgres", "sector": "Premium Door Manufacturer · Lead Generation",
        "tiles": [("₹28,392", "Ad spend managed"), ("779+", "Qualified leads"),
                  ("₹21.38", "Best cost per lead"), ("816K+", "Accounts reached")],
        "rows": [("IndiaWood 2026 · Studio Visit Leads", "439 leads", "₹21.38", "₹9,383.91"),
                 ("New Dealer Leads · Pan-India", "136 leads", "₹31.82", "₹4,328.06"),
                 ("Direct Customer Leads · Dealer Pincodes", "106 leads", "₹86.36", "₹9,153.81"),
                 ("Door Brand Awareness · Pan-India", "674,661 reach", "₹2.19 / 1K", "₹1,480.46")],
    },
    {
        "n": "02", "name": "VMake WPC", "sector": "Building Materials · Lead Generation",
        "tiles": [("₹14,956", "Ad spend managed"), ("319+", "Qualified leads"),
                  ("₹18.83", "Best cost per lead"), ("289K+", "Impressions")],
        "rows": [("WPC Lead Gen · Bengaluru 25–54", "147 leads", "₹18.83", "₹2,768.48"),
                 ("WPC Lead Gen · Bengaluru 25–54", "172 leads", "₹54.21", "₹9,323.90"),
                 ("New Traffic Campaign", "2,645 clicks", "₹1.08", "₹2,863.75")],
    },
    {
        "n": "03", "name": "Thrishank Doors &amp; Ply", "sector": "Home Improvement · Multi-Channel",
        "tiles": [("₹21,186", "Ad spend managed"), ("1,078+", "WhatsApp conversations"),
                  ("₹8.05", "Cost per conversation"), ("352", "Instagram profile visits")],
        "rows": [("WhatsApp Leads", "1,078 chats", "₹8.05", "₹8,679.13"),
                 ("Door · Warm Leads · Karnataka", "11 leads", "₹862.56", "₹9,488.12"),
                 ("Door Brand Awareness · Cold", "352 visits", "₹2.56", "₹900.87")],
    },
]


def ads_blocks():
    out = []
    for a in ADS:
        tiles = "\n".join(
            f'          <div class="tile{" tile--hot" if i == 0 else ""}"><b>{v}</b><span>{label}</span></div>'
            for i, (v, label) in enumerate(a["tiles"]))
        rows = "\n".join(
            f'              <tr><th scope="row">{c}</th><td>{r}</td><td>{cost}</td><td>{spend}</td></tr>'
            for c, r, cost, spend in a["rows"])
        out.append(f'''    <article class="ads reveal">
      <div class="ads__head">
        <div>
          <span class="case__n">Meta Ads · Client {a["n"]}</span>
          <h3>{a["name"]}</h3>
        </div>
        <p class="ads__sector">{a["sector"]}</p>
      </div>

      <div class="tiles">
{tiles}
      </div>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr><th scope="col">Campaign</th><th scope="col">Results</th><th scope="col">Cost / result</th><th scope="col">Spend</th></tr>
          </thead>
          <tbody>
{rows}
          </tbody>
        </table>
      </div>
    </article>''')
    return "\n\n".join(out)


CAMPAIGN_FLOW = ["Challenge", "Research", "Strategy", "Execution", "Results", "Impact"]

PROCESS_STAGES = [
    ("01", "Discovery", "We learn the business before the brand — who buys, what they weigh up, and where the enquiries currently leak away."),
    ("02", "Strategy", "Positioning, messaging and the plan for how attention becomes revenue. This is where we agree what success is measured in."),
    ("03", "Design", "Identity, interface and campaign creative, designed around how your customer actually decides."),
    ("04", "Development", "Fast, reliable builds on the stack that fits — Webflow, Shopify, or a custom CMS."),
    ("05", "Launch", "Tracking, pixels and analytics live from day one, so the first week of data is usable."),
    ("06", "Scale", "SEO, retention and paid media compound the launch instead of letting it fade."),
]


# ----------------------------------------------------------------------
# pages
# ----------------------------------------------------------------------

TESTIMONIALS = f'''<section class="section section--yellow">
  <div class="wrap">
    <div class="section__head section__head--center reveal">
      <span class="kicker">Client words</span>
      <h2>What they said afterwards</h2>
    </div>

    <div class="quotes">
      <article class="quote reveal">
        <span class="quote__mark" aria-hidden="true">“</span>
        <p>{CASES[0]["quote"]}</p>
        <div class="quote__who"><span class="avatar">MP</span><div><b>Mahendra Patel</b><span>CEO, Wudgres</span></div></div>
      </article>
      <article class="quote reveal">
        <span class="quote__mark" aria-hidden="true">“</span>
        <p>{CASES[1]["quote"]}</p>
        <div class="quote__who"><span class="avatar">VP</span><div><b>Vishal Patel</b><span>CEO, VMake WPC</span></div></div>
      </article>
      <article class="quote reveal">
        <span class="quote__mark" aria-hidden="true">“</span>
        <p>{CASES[3]["quote"]}</p>
        <div class="quote__who"><span class="avatar">RP</span><div><b>Ritik Patel</b><span>CEO, Crystaline</span></div></div>
      </article>
    </div>
  </div>
</section>'''


HOME_BODY = f'''<section class="hero">
  <div class="wrap hero__inner">
    <span class="pill"><i></i> Branding · Websites · Performance Marketing</span>

    <h1>Buzzing brands into the <span class="hl">spotlight</span></h1>

    <div class="hero__foot">
      <div>
        <p class="lede">
          We build brands that people remember, design digital experiences that convert,
          and run campaigns that generate revenue — not just impressions. Get Bee Seen is
          a full-service digital partner for brands that refuse to blend in.
        </p>
        <div class="hero__cta">
          <a href="contact.html" class="btn btn--green">Start a project {ARROW}</a>
          <a href="work.html" class="btn">See our work</a>
        </div>
      </div>

      <div class="hero__art">
        <img class="hero__bee" src="assets/bee.svg" alt="The Get Bee Seen bee">
        <div class="chip chip--1"><b>₹100K+</b><span>Ad spend managed</span></div>
        <div class="chip chip--2"><b>50+</b><span>Websites built</span></div>
        <div class="chip chip--3"><b>5,000+</b><span>Leads generated</span></div>
      </div>
    </div>
  </div>
</section>

<div class="ticker" aria-hidden="true">
  <div class="ticker__track">
    <span>Branding</span><span>Websites</span><span>Performance Marketing</span>
    <span>SEO</span><span>Social Media</span><span>Video Production</span><span>AI Automation</span>
  </div>
  <div class="ticker__track">
    <span>Branding</span><span>Websites</span><span>Performance Marketing</span>
    <span>SEO</span><span>Social Media</span><span>Video Production</span><span>AI Automation</span>
  </div>
</div>

{PHILOSOPHY}

<section class="section section--white">
  <div class="wrap">
    <div class="section__head reveal">
      <span class="kicker">What we do</span>
      <h2>Twelve services, one partner</h2>
      <p>Six that build the brand, six that grow it. Take the parts you need — they're
        designed to compound when you stack them.</p>
    </div>

    <div class="cards">
{service_cards(BRAND_SERVICES[:3] + GROWTH_SERVICES[:3])}
    </div>

    <div class="section__more reveal">
      <a href="services.html" class="btn">See all twelve services {ARROW}</a>
    </div>
  </div>
</section>

{numbers("green")}

<section class="section">
  <div class="wrap">
    <div class="section__head reveal">
      <span class="kicker">Selected work</span>
      <h2>Eight brands, eight builds</h2>
      <p>A few of the websites we've designed and shipped — with more added every quarter.</p>
    </div>

    <div class="work-grid">
{case_preview()}
    </div>

    <div class="section__more reveal">
      <a href="work.html" class="btn">See every case study {ARROW}</a>
    </div>
  </div>
</section>

{APART}

{TESTIMONIALS}

{CTA}'''


SERVICES_BODY = f'''{page_hero(
    "What we do",
    "Everything a brand needs to stop blending in",
    "Twelve services across brand and growth. Most clients start with one and add the rest "
    "as the results come in — every engagement begins with a conversation, not a contract.",
    '<div class="hero__cta"><a href="contact.html" class="btn btn--green">Start a project ' + ARROW + '</a>'
    '<a href="process.html" class="btn">How we work</a></div>')}

{SERVICE_GROUPS}

{INDUSTRIES_BLOCK}

{CTA}'''


WORK_BODY = f'''{page_hero(
    "Selected work",
    "Real builds, real campaigns, real numbers",
    "Websites we've designed and shipped, identities we've built, and Meta Ads accounts we "
    "manage — with the spend and cost per lead made legible.")}

<section class="section">
  <div class="wrap">
    <div class="section__head reveal">
      <span class="kicker">Websites</span>
      <h2>Designed, built and shipped</h2>
      <p>Eight brands, eight builds — more added every quarter.</p>
    </div>

    <div class="cases">
{case_blocks()}
    </div>
  </div>
</section>

{BRAND_WORK}

<section class="section" id="ads">
  <div class="wrap">
    <div class="section__head reveal">
      <span class="kicker">Performance marketing</span>
      <h2>Meta Ads accounts we manage</h2>
      <p>Leads, reach and cost — straight from the ad accounts, not rounded up for a deck.</p>
    </div>

    <div class="ads-list">
{ads_blocks()}
    </div>
  </div>
</section>

{TESTIMONIALS}

{CTA}'''


PROCESS_BODY = f'''{page_hero(
    "How we work",
    "Six stages, one outcome",
    "The same path every project takes, from first conversation to compounding growth. "
    "You'll always know which stage you're in and what comes next.")}

<section class="section section--white">
  <div class="wrap">
    <div class="steps">
''' + "\n".join(f'''      <article class="step reveal">
        <b>{n}</b>
        <div><h3>{name}</h3><p>{body}</p></div>
      </article>''' for n, name, body in PROCESS_STAGES) + f'''
    </div>
  </div>
</section>

<section class="section section--green">
  <div class="wrap">
    <div class="section__head section__head--center reveal">
      <span class="kicker">Paid media</span>
      <h2>How every campaign runs</h2>
      <p>The loop we repeat on every ad account we manage.</p>
    </div>

    <ol class="flow reveal">
''' + "\n".join(f'      <li><span>{i:02d}</span>{name}</li>'
                for i, name in enumerate(CAMPAIGN_FLOW, 1)) + f'''
    </ol>
  </div>
</section>

{PHILOSOPHY}

{CTA}'''


ABOUT_BODY = f'''{page_hero(
    "Who we are",
    "A digital partner for brands that refuse to blend in",
    "Get Bee Seen is a branding, web and performance marketing agency in Bengaluru. We build "
    "brands that people remember, design digital experiences that convert, and run campaigns "
    "that generate revenue — not just impressions.")}

<section class="section section--white">
  <div class="wrap split">
    <div class="split__art reveal">
      <img src="assets/bee.svg" alt="The Get Bee Seen bee">
    </div>
    <div class="reveal">
      <span class="kicker">The thought behind the bee</span>
      <h2>Visibility, with the eyes to prove it</h2>
      <p>
        Our logo draws on the brand's core idea: visibility. The playful bee with exaggerated,
        popping eyes captures attention instantly — echoing what we do for the businesses we
        work with, helping them stand out in crowded digital spaces.
      </p>
      <p>
        Paired with bold, approachable typography and vibrant colour, the identity balances fun
        and professionalism. That balance runs through the work too: we'd rather make something
        people actually want to watch than another polished asset nobody remembers.
      </p>
    </div>
  </div>
</section>

{PHILOSOPHY}

{APART}

{INDUSTRIES_BLOCK}

{numbers("green")}

{CTA}'''


CONTACT_BODY = f'''{page_hero(
    "Contact",
    "Let's make your brand impossible to ignore",
    "Tell us what you're building and we'll come back with where the attention is leaking and "
    "what we'd do about it. No pitch deck, no pressure.")}

<section class="section section--green">
  <div class="wrap contact-grid">
    <div class="reveal">
      <span class="kicker">Talk to us</span>
      <h2>Four ways to reach the hive</h2>

      <ul class="contact-list">
        <li>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/></svg>
          <div><b><a href="mailto:info@getbeeseen.com">info@getbeeseen.com</a></b><span>We reply within one business day</span></div>
        </li>
        <li>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z"/></svg>
          <div><b><a href="tel:+918147452427">+91 81474 52427</a></b><span>Mon–Sat, 10am–7pm IST</span></div>
        </li>
        <li>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <div><b>Bengaluru</b><span>3rd Floor, 475, RBI Layout Main Road,<br>JP Nagar 7th Phase, Bengaluru, Karnataka 560078</span></div>
        </li>
        <li>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none"/></svg>
          <div><b>@getbeeseen</b><span>Instagram &amp; LinkedIn</span></div>
        </li>
      </ul>
    </div>

    <form class="form reveal" id="contactForm" novalidate>
      <div class="form__row">
        <div class="field">
          <label for="name">Your name</label>
          <input type="text" id="name" name="name" placeholder="Your name" required>
        </div>
        <div class="field">
          <label for="email">Email</label>
          <input type="email" id="email" name="email" placeholder="you@company.com" required>
        </div>
      </div>

      <div class="form__row">
        <div class="field">
          <label for="company">Company</label>
          <input type="text" id="company" name="company" placeholder="Company name">
        </div>
        <div class="field">
          <label for="service">What do you need?</label>
          <select id="service" name="service">
            <option>Branding &amp; identity</option>
            <option selected>Website design &amp; development</option>
            <option>Performance marketing</option>
            <option>SEO</option>
            <option>Social media</option>
            <option>Something else</option>
          </select>
        </div>
      </div>

      <div class="field">
        <label for="message">Tell us about the project</label>
        <textarea id="message" name="message" placeholder="What are you building, and what does success look like?"></textarea>
      </div>

      <button type="submit" class="btn btn--yellow">Send enquiry {ARROW}</button>

      <p class="form__note">This form doesn't send anywhere yet — connect it to your inbox or a form service before going live.</p>
      <div class="form__ok" id="formOk">Thanks! That's landed with us — we'll be in touch within one business day. 🐝</div>
    </form>
  </div>
</section>

{INDUSTRIES_BLOCK}'''


PAGES = [
    {"file": "index.html", "active": "index.html",
     "title": "Get Bee Seen — Branding, Websites &amp; Performance Marketing",
     "desc": "Get Bee Seen is a branding, web and performance marketing agency in Bengaluru. We build brands people remember and campaigns that generate revenue.",
     "body": HOME_BODY},
    {"file": "services.html", "active": "services.html",
     "title": "Services — Get Bee Seen",
     "desc": "Brand strategy, identity, creative production, photography, video, influencer marketing, websites, SEO, performance marketing, social and AI automation.",
     "body": SERVICES_BODY},
    {"file": "work.html", "active": "work.html",
     "title": "Our Work — Get Bee Seen",
     "desc": "Website case studies, brand identity work and Meta Ads performance for Wudgres, VMake WPC, Healthy Master, Crystaline and Pixel Smile Labs.",
     "body": WORK_BODY},
    {"file": "process.html", "active": "process.html",
     "title": "How We Work — Get Bee Seen",
     "desc": "Six stages from discovery to scale, and the loop we repeat on every paid media account we manage.",
     "body": PROCESS_BODY},
    {"file": "about.html", "active": "about.html",
     "title": "About — Get Bee Seen",
     "desc": "A branding, web and performance marketing agency in Bengaluru, working across real estate, manufacturing, healthcare, luxury, interiors and retail.",
     "body": ABOUT_BODY},
    {"file": "contact.html", "active": "contact.html",
     "title": "Contact — Get Bee Seen",
     "desc": "Talk to Get Bee Seen in Bengaluru: info@getbeeseen.com, +91 81474 52427, JP Nagar 7th Phase.",
     "body": CONTACT_BODY},
]


# ----------------------------------------------------------------------
# writers
# ----------------------------------------------------------------------

def write_pages():
    for page in PAGES:
        html = f'''<!DOCTYPE html>
<html lang="en">
<head>
{head(page)}
</head>

<body class="is-loading">

{LOADER}

{header(page["active"])}

<main id="top">

{page["body"]}

</main>

{FOOTER}

<script src="script.js"></script>
</body>
</html>
'''
        path = os.path.join(ROOT, page["file"])
        with open(path, "w") as fh:
            fh.write(html)
        print(f'  {page["file"]:<16} {len(html):>7,} bytes')


def write_preview():
    """One self-contained file with all six pages bundled, for sharing a
    preview link. Nav links become in-page routes and assets are inlined."""
    css = open(os.path.join(ROOT, "styles.css")).read()
    js = open(os.path.join(ROOT, "script.js")).read()

    sections = []
    for page in PAGES:
        route = page["file"].replace(".html", "")
        sections.append(
            f'<div class="route" id="route-{route}" data-title="{page["title"]}">\n'
            f'<main>\n{page["body"]}\n</main>\n{FOOTER}\n</div>'
        )

    body = (LOADER + "\n\n" + header("index.html") + "\n\n" + "\n\n".join(sections))

    # inline the logo artwork as data URIs
    for name in ("bee", "badge", "wordmark-green", "wordmark-cream", "wordmark-yellow"):
        raw = open(os.path.join(ROOT, "assets", f"{name}.svg"), "rb").read()
        uri = "data:image/svg+xml;base64," + base64.b64encode(raw).decode()
        body = body.replace(f'src="assets/{name}.svg"', f'src="{uri}"')

    for fname in sorted(os.listdir(os.path.join(ROOT, "assets", "work"))):
        raw = open(os.path.join(ROOT, "assets", "work", fname), "rb").read()
        uri = "data:image/webp;base64," + base64.b64encode(raw).decode()
        body = body.replace(f'src="assets/work/{fname}"', f'src="{uri}"')

    # page links become hash routes
    for page in PAGES:
        route = page["file"].replace(".html", "")
        body = body.replace(f'href="{page["file"]}"', f'href="#{route}"')
        body = body.replace(f'href="{page["file"]}#', f'href="#{route}--')

    assert "assets/" not in body, "an asset reference was left un-inlined"

    fonts = ("@import url('https://fonts.googleapis.com/css2?"
             "family=Alfa+Slab+One&family=Archivo:wght@400;500;600;700&display=swap');\n\n")

    router = '''
/* --- preview build only: swap bundled pages on hash change --- */
(function () {
  var routes = document.querySelectorAll('.route');

  function show(name) {
    var target = document.getElementById('route-' + name) || routes[0];
    routes.forEach(function (r) { r.classList.toggle('is-current', r === target); });
    document.title = target.getAttribute('data-title');
    document.querySelectorAll('.nav a').forEach(function (a) {
      var on = a.getAttribute('href') === '#' + name;
      a.classList.toggle('is-active', on);
      if (on) { a.setAttribute('aria-current', 'page'); } else { a.removeAttribute('aria-current'); }
    });
    window.scrollTo(0, 0);
    if (window.gbsRefresh) window.gbsRefresh();
  }

  function fromHash() {
    return (location.hash || '#index').slice(1).split('--')[0];
  }

  window.addEventListener('hashchange', function () { show(fromHash()); });
  show(fromHash());
})();
'''

    out = ("<title>Get Bee Seen</title>\n<style>\n" + fonts + css +
           "\n.route { display: none; }\n.route.is-current { display: block; }\n</style>\n\n"
           + body +
           "\n\n<script>\n" + js.replace("  var reduceMotion =",
                                         "\n  document.body.classList.add('is-loading');\n\n  var reduceMotion =", 1)
           + "\n" + router + "\n</script>\n")

    path = os.path.join(ROOT, "preview.html")
    with open(path, "w") as fh:
        fh.write(out)
    print(f'  preview.html     {len(out):>7,} bytes  (bundled, self-contained)')


if __name__ == "__main__":
    print("Building Get Bee Seen…")
    write_pages()
    write_preview()
    print("Done.")
