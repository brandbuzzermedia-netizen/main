# Contact compliance

**This is product design, not legal advice.** The rules below are a conservative reading of each
market's marketing-contact law as of October 2026. Before any tenant enables automated outreach in
a market, the platform owner should have them reviewed by counsel in that market. The platform
never claims to guarantee compliance.

## The eligibility engine

`src/domain/eligibility.ts` answers one question: *may this organization contact this person on
this channel, right now?* It is a pure function and is unit-tested
(`tests/unit/eligibility.test.ts`). Its version number (`RULESET_VERSION`) changes whenever a rule
changes.

Inputs:
- the channel;
- the recipient's country and time zone;
- whether a contact value exists;
- suppression (all channels or this channel);
- whether the lead is in the *Opted out* stage;
- the newest consent record for the channel;
- the organization's contact window and enquiry age limit.

Output: a decision, the reasons, a plain-language note on the basis, and, when the decision is
`defer`, the earliest allowed time.

| Decision | Meaning | What automation must do (phase 4+) |
|----------|---------|------------------------------------|
| `allow` | A sufficient basis is recorded and it is within hours | Send |
| `defer` | Eligible, but outside the recipient's permitted hours | Wait until `notBefore` |
| `review` | Software cannot settle it: no basis where one isn't strictly required, a registry check that isn't integrated, an unknown country or time zone | Hold for a person |
| `block` | Suppressed, opted out, consent withdrawn, or no sufficient basis where one is required | Never send |

The result is shown on every lead page, and every email and SMS (manual or sequence) runs the engine
at the moment of sending. The decision, its reasons and the ruleset version are stored on the
message; the database refuses to mark a message sent unless that decision was `allow`.

Automatic suppression sources: SMS STOP-style replies (all phone channels), email unsubscribe
links, hard bounces and spam complaints (email).

### Rules by market

The *accepts* column lists the bases that make contact allowed. Hours are in the recipient's local
time. The organization's own window (default 09:00–20:00) applies on top, and the stricter wins.

| Market | Email | SMS | Live call (person) | AI voice call | Statutory hours |
|--------|-------|-----|--------------------|---------------|-----------------|
| US | any recorded basis, else review (CAN-SPAM is opt-out, but the platform wants a basis) | express written (TCPA) | consent or EBR (inquiry ≤ 90 days), else review for National DNC | express written (FCC 2024: AI voices are "artificial") | 08:00–21:00 |
| GB | express or soft opt-in (PECR) | express or soft opt-in | any basis, else review for TPS/CTPS | express (PECR automated calls) | none (org window) |
| CA | express or implied (EBR, inquiry ≤ 6 months) (CASL) | same | same, else review for DNCL | express (ADAD rules) | Mon–Fri 09:00–21:30, weekends 10:00–18:00 |
| AU | express or inferred (Spam Act) | same | same, else review for DNCR | express | Mon–Fri 09:00–20:00, Sat 09:00–17:00, no Sunday |
| AE | express or existing relationship (conservative) | express | same, else review for DNCR | express | 09:00–18:00 (verify with counsel) |
| Other | express | express | express | express | org window |

Known gaps, to be closed before outreach is enabled in each market:
- **US state laws.** Florida, Oklahoma, Maryland and others have mini-TCPAs with stricter hours,
  call-frequency limits and broader autodialer definitions. Per-state rules are planned for
  phase 4 (the lead's state is needed).
- **Public holidays.** Australia bans calls on national public holidays, and this is not modelled
  yet.
- **Registry screening** (US DNC, TPS, DNCL, DNCR, UAE DNCR) is not integrated. Calls that rely on
  "no consent but not registered" therefore always go to review.
- **Call frequency caps.** UAE rules and some US state laws limit attempts per day or week. The
  workflow engine will enforce caps in phase 5.
- **Recording and transcription consent.** All-party-consent US states, plus GDPR/UK GDPR, need a
  disclosure at the start of a call. This is phase 6.
- **AI disclosure.** Voice agents must identify themselves as automated and give the business name.
  This is phase 6.

## Data protection

- **Lawful source.** Every import asks the user to confirm the list was obtained lawfully. Each
  lead source has a provenance note. Scraping is not supported (see WORKFLOW.md).
- **Consent records** are append-only evidence. They carry their source, an optional evidence URL,
  the capture time, an expiry, and who recorded them.
- **Opt-outs.** Any role that can edit a lead can record an opt-out; only an admin can lift one.
  Erasure keeps a minimal suppression entry, which is legitimate interest in honouring the objection.
- **Erasure** is handled by `erase_lead`: it deletes the record, cascades its history, and redacts
  the audit trail.
- **Export:**
  - managers can export CSV (data subject access requests are served from it);
  - a per-person export is planned for phase 7.
- **Retention.** Configurable retention for activities, messages and recordings is planned for
  phase 7.
- **Residency.** One Supabase region per deployment. EU/UK-only hosting is a deployment decision
  (see PLAN.md, open decisions).
