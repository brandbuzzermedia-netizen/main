# Reference workflow: interpretation

Source: `REAL ESTATE CLIENT ACQUSITION SYSTEM WITH AI.jpg` (the flowchart supplied with the brief).
The image is low resolution. Much of the small text is unreadable. Anything marked **(unreadable)**
is not guessed at. Each uncertain item has a question in the [Open questions](#open-questions)
section at the end.

## What the chart shows

The chart contains **two funnels** that meet at the CRM.

### Funnel A: outbound "cold" acquisition (right-hand column, read bottom to top)

| # | Box | Readable notes |
|---|-----|----------------|
| A1 | **Cold outreach** | "We will do cold outreach. First we will scrape data from Zillow and other platforms of your location and find expired listings and add to database and outreach them to convince the sellers and buyers." |
| A2 | **Data scrape from Zillow and other platforms** | "After scraping … we will be getting expired listings, luxury property listings, etc. data and we will outreach them." |
| A3 | Three parallel channels: **Cold calls with AI agents (no need for your efforts)**, **SMS**, **Emails** | — |
| A4 | **Listing video** | The three channels converge on a listing or property video. |
| A5 | **Follow-up sequence** | — |
| A6 | Second channel fan-out: **Cold calls with AI agents**, **SMS**, **Emails** | — |
| A7 | **Interested** | Two arrows leave it: one up to **CRM on GoHighLevel**, one left to Funnel A's link into **Step 7**. |

### Funnel B: the numbered inbound pipeline (left-hand column, Steps 1–7)

| Step | What the chart shows | Readability |
|------|----------------------|-------------|
| 1 | A green box at the bottom with a note beside it | Label and note **(unreadable)**. The note looks like a link or URL. |
| 1→2 | A row of four yellow boxes, side by side | Labels **(unreadable)**. Likely lead sources or ad platforms. |
| 2 | A small form or landing-page thumbnail, then a yellow box with a note | **(unreadable)**. Probably a lead-capture form. |
| — | A yellow box on the left ("…ADS"?) feeding Step 3 and the box below it | Partly readable. Possibly retargeting ads. |
| 3 | Two phone screenshots (ads or creatives) with a spreadsheet between them | The spreadsheet note suggests captured leads go into a sheet **(mostly unreadable)**. |
| — | Phone and sheet screenshots linking to a **Step 7** phone mock-up | **(unreadable)** captions. |
| 4 | Three images (a form or WhatsApp screen, a property video thumbnail, an ad image) feeding **Follow-up sequence** | Captions **(unreadable)**. |
| 5 | Three message templates in parallel. **Email follow-ups**: "Email 1: Exclusive property deals introduction", subject line, prime locations, special financing, limited-time pre-launch pricing, offer of a video tour. **Cold calls with AI agents**: share a video tour of top properties in [City], prime areas, competitive pricing, available for immediate booking, schedule a private tour, book a quick call [Calendly link]. **SMS sequence**: "only have 3 units left in [Property Name]", exclusive pricing, flexible financing, move-in ready, schedule a quick call [Calendly link] | Mostly readable |
| 5 (loop) | "IF THEY SAY NO WE NEED TO DO SAME". A negative or no response loops back into the follow-up sequence. | Readable |
| 5→6 | Decision: "If they respond positive then we will send them property video" | Readable |
| 6 | **CRM on GoHighLevel** | The note beside the arrow is **(unreadable)**. It probably says what happens to interested leads in the CRM. |
| 7 | A phone mock-up, joined to Funnel A's **Interested** box | **(unreadable)**. Probably the agent's CRM app or a WhatsApp conversation. |

## Structured process (as the platform will model it)

```
Lead acquired ── source recorded, provenance recorded
   │   Funnel A: licensed data / customer-authorised list (NOT scraping, see below)
   │   Funnel B: ad → landing form → lead (consent captured on the form)
   ▼
Validate & dedupe ── normalise email/phone, match existing lead, suppression check
   ▼
Eligibility check per channel ── consent/basis, suppression, DNC registry, contact hours
   ▼
Initial outreach (only on eligible channels): email / SMS / AI voice call
   ▼
Follow-up sequence ── Day 0/1/3/5/7 (configurable); content: property video, offers
   │      ├─ no reply / "no" → continue sequence within limits → long-term nurture
   │      ├─ STOP / opt-out → suppress, end all sequences
   │      └─ asks for a person → human handoff
   ▼
Positive response → send property / listing video → qualify (AI or rep)
   ▼
Interested / qualified → book call or viewing (calendar-confirmed)
   ▼
CRM update (internal pipeline, and GoHighLevel when connected) → notify the assigned rep
```

## How the chart maps to platform modules

| Chart element | Module | Status |
|---------------|--------|--------|
| Data scrape → database | B. Lead acquisition: CSV import, licensed-provider adapters | Import **built** (phase 3). Provider adapters in phase 6. |
| Landing form (Step 2), sheet (Step 3) | B. Lead acquisition: web-form capture with consent text | Phase 4 (form endpoint). Today: CSV import. |
| Cold calls with AI agents | D. AI calling: consent-gated | Phase 6 |
| SMS / Email | E. Messaging, F. Email | Phase 4 |
| Listing / property video | J. Property and listing engagement | Phase 6. Asset links only at first. |
| Follow-up sequence, "if they say no do the same" | G. Workflow engine: sequences, stop conditions, retry limits | Phase 5 |
| Decision diamond (positive response) | C. Qualification: intent classification plus a human override | Phase 4 |
| Interested | Pipeline stage "Interested" (category *qualified*) | **Built** (phase 3) |
| CRM on GoHighLevel | H. GoHighLevel integration. Internal CRM works without it. | Internal CRM **built**. GHL sync in phase 6. |
| Calendly links in templates | I. Appointments: calendar-confirmed bookings | Phase 6 |

## Where the platform deliberately differs from the chart

1. **No scraping of Zillow or other portals.** Zillow's terms of use prohibit automated data
   collection, and its data is licensed. The platform supports **licensed data** instead:
   - MLS data through RESO Web API with broker authorisation;
   - commercial property and owner data providers, under their licence;
   - the customer's own lists, imported with a lawful-source confirmation and provenance notes.

   Expired-listing data is a common product from licensed vendors, so the "expired listings"
   strategy can survive without scraping.
2. **"Cold calls with AI agents, no need for your efforts" cannot be the default in the US.** The FCC ruled
   in February 2024 that AI-generated voices are "artificial" under the TCPA. Marketing calls with
   them need *prior express written consent*. Calling a scraped list of expired-listing owners
   without that consent would be unlawful. The platform therefore:
   - lets AI voice calls go only to leads with recorded express written consent (US), or the
     market's equivalent;
   - sends live human calls to people without consent through a DNC registry check first.

   The UK (PECR automated calls), Canada (CRTC ADAD rules) and Australia have similar rules.
3. **Cold SMS also needs consent.** That means express written consent in the US for automated marketing texts, and
   consent or a soft opt-in in the UK, Canada (CASL) and Australia (Spam Act).
4. **Scarcity claims in templates** ("only 3 units left") must be true. Message templates are
   per-tenant content, and Phase 4 adds an approval step so they cannot be sent unreviewed.

These points are the main reason the contact-eligibility engine
(`src/domain/eligibility.ts`, explained in [COMPLIANCE.md](COMPLIANCE.md)) was built before any
sending.

## Open questions

These are for the product owner. None blocks Phases 1–3.

1. Step 1 and the four boxes after it: which lead sources are they (Meta lead ads, Google, portals)?
2. Step 2: is the form hosted by GoHighLevel, by the platform, or by a third party?
3. Step 3 spreadsheet: is a Google Sheet part of the intended process, or only a stand-in for the CRM?
4. Step 6 note: what should happen in GoHighLevel when a lead becomes interested (pipeline,
   opportunity stage, tag, workflow trigger)?
5. Step 7 phone mock-up: is it WhatsApp, the GHL mobile app, or SMS?
6. Funnel A: which licensed data provider(s) and which markets should come first?
7. Is the listing video one generic asset per campaign, or per property / per lead?
