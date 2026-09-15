# Phased delivery

The spec asks for phased development rather than everything at once. This is
where each phase stands.

## Phase 1 — MVP · built

The MVP is usable by a real agency today.

| # | Capability | State |
| --- | --- | --- |
| 1 | Authentication, sessions, RBAC, tenant isolation | built |
| 2 | Agency dashboard | built |
| 3 | Client management | built |
| 4 | Brand profiles | built |
| 5 | Keyword management | built |
| 6 | Social account connection (OAuth, 8 adapters) | built — needs platform app credentials to connect |
| 7 | Trend discovery and scoring | built — returns results only from platforms whose official APIs support search |
| 8 | Inspiration discovery | built — same constraint |
| 9 | AI content analysis | built |
| 10 | Engagement opportunity discovery and scoring | built |
| 11 | AI comment generation (3 variants) | built |
| 12 | Human approval queue | built |
| 13 | Basic analytics | built |
| 14 | Daily AI briefing | built |

Also built, ahead of the phase plan because the safety story needed them:
the content safety gate, the ten-check comment quality checker, the anti-spam
system, the global emergency stop, the audit log, prompt management with
versioning, and the publishing engine with retry classification.

## Phase 2 — partly built

| Capability | State |
| --- | --- |
| Content calendar | built |
| Automated permitted publishing | built (publishing engine, scheduler, safety gate, per-client autopilot) |
| Content repurposing | built (`/repurpose` reports which platforms can carry the content and which need a person) |
| Competitor intelligence | built — limited by what official APIs expose about other accounts |
| AI learning loop | built (`performance_analyst` + `ai_recommendations`) |
| Advanced analytics | partial — per-platform and per-type breakdowns exist; cohort and funnel analysis do not |
| Team collaboration | partial — roles, assignment and audit exist; comments-on-items and @mentions do not |
| Client dashboard | partial — the `client` role and its permission set exist; a dedicated restricted view does not |

## Phase 3 — not started

Advanced autonomous agents, predictive trend detection, cross-client
intelligence, an advanced recommendation engine, automated reporting,
white-label.

Note on cross-client intelligence: it conflicts with the tenant isolation this
system is built around. If it is taken on, it needs an explicit consent model
per client and an aggregation boundary that cannot leak one client's data into
another's recommendations. That is a design exercise, not a feature toggle.

## Known limits, stated plainly

- **Research depends on platform search APIs.** Instagram, Facebook, LinkedIn
  and Threads offer no general public-search API, so they contribute nothing to
  trend and opportunity discovery. The system reports this per platform rather
  than filling the gap from an unofficial source. In practice, X, Reddit and
  YouTube carry discovery today.
- **Quora is entirely manual.** No write API, no public content API, no scraping.
- **Media handling has no store.** Publishing expects media at an HTTPS URL. A
  media library with upload, transcode and CDN delivery is not built.
- **The offline AI provider is a heuristic**, not a model. It exists so the
  product runs and tests without an API key. Set `ANTHROPIC_API_KEY` for real
  copy and real assessments.
- **Single-node deployment.** SQLite and an in-process queue are fine for one
  agency. Postgres and an external queue are a documented swap of two modules —
  see ARCHITECTURE.md — but that swap has not been made or tested.
- **No email or push delivery.** Notifications are stored and shown in-product;
  no transport is wired up.
