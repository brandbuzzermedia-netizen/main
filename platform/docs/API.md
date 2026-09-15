# API

JSON over HTTP. Authentication is a session cookie set by `POST /api/auth/login`
(a bearer token is also accepted). Every response carries `x-request-id`.

Errors:

```json
{ "error": { "code": "forbidden", "message": "…", "request_id": "req_…" } }
```

An operation a platform cannot perform officially returns HTTP 422 with:

```json
{ "error": { "code": "manual_action_required", "status": "MANUAL_ACTION_REQUIRED",
             "platform": "instagram", "message": "…", "how_to": "…" } }
```

## Auth

| | |
| --- | --- |
| `POST /api/auth/login` | `{agency_slug, email, password}` |
| `POST /api/auth/logout` | |
| `GET /api/auth/me` | current user, agency, AI provider |

## Clients and onboarding

| | |
| --- | --- |
| `GET /api/clients` | list, with per-client counts |
| `POST /api/clients` | step 1 — business information |
| `GET /api/clients/:id` | full record: brand, pillars, keywords, competitors, accounts, automation |
| `PATCH /api/clients/:id` | |
| `PUT /api/clients/:id/brand-profile` | step 2 — brand voice |
| `POST /api/clients/:id/pillars` | step 3 — content pillars |
| `POST /api/clients/:id/keywords` | step 4 — keywords (bulk) |
| `DELETE /api/clients/:id/keywords/:keywordId` | |
| `POST /api/clients/:id/competitors` | |

## Social accounts

| | |
| --- | --- |
| `GET /api/platforms` | live capability matrix |
| `GET /api/clients/:id/accounts` | connection, API and token status |
| `POST /api/clients/:id/accounts/:platform/connect` | returns the platform's authorisation URL |
| `GET /api/oauth/:platform/callback` | OAuth callback (public) |
| `POST /api/accounts/:accountId/verify` | live check against the platform |
| `DELETE /api/accounts/:accountId` | disconnect and delete stored tokens |

Tokens never appear in any response.

## Intelligence

| | |
| --- | --- |
| `GET /api/clients/:id/trends` | filters: `classification`, `min_score` |
| `POST /api/clients/:id/trends/discover` | enqueues a background run |
| `GET /api/clients/:id/inspiration` | filters: platform, format, language, geography, min_engagement, min_views, since, saved; sort: viral, relevant, growing, recent, engagement |
| `POST /api/clients/:id/inspiration/:itemId/save` | |
| `POST /api/clients/:id/inspiration/:itemId/analyze` | re-run the Content Analyst |
| `GET /api/clients/:id/opportunities` | |
| `POST /api/clients/:id/opportunities/discover` | |
| `PATCH /api/clients/:id/opportunities/:oppId` | change status |
| `GET /api/clients/:id/competitors` | |
| `POST /api/clients/:id/competitors/analyze` | |

## Comments

| | |
| --- | --- |
| `POST /api/clients/:id/opportunities/:oppId/comments` | draft three alternatives, quality-check each, queue the best for approval |
| `GET /api/clients/:id/opportunities/:oppId/comments` | |
| `PATCH /api/comments/:commentId` | edit — **re-runs the quality checks** |
| `POST /api/comments/:commentId/approve` | |
| `POST /api/comments/:commentId/send` | queue an approved comment for publishing |

## Content

| | |
| --- | --- |
| `GET /api/clients/:id/ideas` | |
| `POST /api/clients/:id/ideas/generate` | |
| `POST /api/clients/:id/content-plan` | the whole flow: ideas → copy → timing → safety → approval queue |
| `POST /api/clients/:id/ideas/:ideaId/draft` | one idea → platform-specific drafts |
| `GET /api/clients/:id/calendar` | `from`, `to` |
| `POST /api/clients/:id/content` | create manually (validates platform capability first) |
| `PATCH /api/content/:contentId` | edit — an approved item returns to review |
| `POST /api/content/:contentId/safety-check` | run the gate without publishing |
| `POST /api/content/:contentId/repurpose` | which platforms can carry this, and which need a person |
| `GET /api/clients/:id/best-time` | `platform`, `content_type`, `tz_offset` |

## Approvals and publishing

| | |
| --- | --- |
| `GET /api/approvals` | `status`, `kind`, `client_id` |
| `POST /api/approvals/:itemId/decide` | `{decision, note, publish_now}` |
| `POST /api/approvals/bulk` | requires `confirm: true` — the first call returns a summary to confirm |
| `POST /api/content/:contentId/publish` | approved items only |
| `POST /api/publishing-jobs/:jobId/retry` | refused for permanent failures |
| `POST /api/content/:contentId/mark-published` | record a manual publish |
| `GET /api/clients/:id/publishing-log` | scheduled vs actual, post id, URL, method, error, retry history |

## Dashboards, analytics, automation

| | |
| --- | --- |
| `GET /api/dashboard` | agency overview |
| `GET /api/clients/:id/dashboard` | the client command centre |
| `GET /api/clients/:id/brief` · `POST …/brief/generate` | daily brief |
| `GET /api/clients/:id/analytics` · `POST …/analytics/learn` | |
| `POST /api/automation/pause-all` · `resume-all` | **global emergency stop** |
| `POST /api/clients/:id/automation/pause` | per client or per platform |
| `PUT /api/clients/:id/automation` | autopilot, recurring slots, thresholds |

## Assistant, search, admin

| | |
| --- | --- |
| `POST /api/clients/:id/assistant` | answers only from that client's stored data |
| `GET /api/search?q=` | across trends, inspiration, opportunities, ideas, published content |
| `GET /api/notifications` · `POST /api/notifications/:id/read` | |
| `GET /api/audit` | `client_id`, `object_type`, `object_id`, `actor_type` |
| `GET /api/prompts` · `POST /api/prompts/:key` | prompt management |
| `GET /api/system/status` | provider, thresholds, limits, capabilities, queue depth |
| `GET /api/health` | public |
