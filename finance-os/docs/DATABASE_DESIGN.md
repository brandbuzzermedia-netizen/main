# Database design

PostgreSQL via Supabase. Migrations in `supabase/migrations`, applied in filename order.
`scripts/test-db.sh` applies them to a scratch database and runs `supabase/tests/*.sql`.

## Conventions (unchanged from Finance OS)

* UUID keys; `created_at`/`updated_at` on mutable rows (`app.touch_updated_at`).
* Money is `bigint` minor units next to an explicit `currency`. Totals never mix currencies.
* Every tenant row carries `organization_id` (= company). Child rows reference parents with
  **composite** foreign keys `(organization_id, id)` so a row can never point into another company.
* RLS on every table; `anon` has no grants at all.
* Sensitive changes are written by audit triggers to `audit_logs` (append-only for users).

## Tenancy model

```
family_groups 1─* organizations (companies)        family_groups 1─* group_memberships *─1 users
organizations 1─* memberships *─1 users            roles 1─* role_permissions *─1 permissions
```

* `organizations` is the company registry (decision D2). Added columns: `family_group_id`,
  `slug` (unique, URL key), `short_name`, `ownership_type`, `owner_label` (descriptive only),
  `consolidation`, `business_model`, `lifecycle_status`, `enabled_modules`, `sidebar_color`,
  `accent_color`, `logo_key`, `fy_start_month`, `emergency_stop*`.
* Users may update descriptive columns only (column-level grants). `family_group_id`, `slug`,
  `ownership_type`, `consolidation`, `is_demo` and the emergency-stop columns change only through
  RPCs: `attach_company_to_group`, `set_company_registry` (group owner), `set_emergency_stop`.
* A company always keeps one owner and a group one group owner (triggers).

## CRM foundation (Phase 1, extended in Phase 3)

| Table | Notes |
| --- | --- |
| `pipeline_stages` | Per company; `kind` (open, meeting, proposal, negotiation, won, lost) lets dashboards find proposals and wins whatever the stage is called; `probability_pct` drives the weighted forecast (won = 100, lost = 0 enforced). |
| `deals` | Stage via composite FK; `value_minor` + `currency`; `owner_id`; `is_hot`; next action and date; `last_activity_at` bumped on stage/value/next-step change; `closed_at` set from stage kind. |
| `deal_shares` | The only way a partner sees a deal. |
| `meetings` | `starts_at` UTC; status scheduled/completed/cancelled/no_show; optional deal. |
| `tasks` | Assignee, due date, priority, status; `completed_at` maintained by trigger. |

`app.guard_crm_people` rejects an owner, assignee or share recipient who is not a member of the
same company, so a record cannot be handed (and leaked) to an outsider.

## Indexes

`organizations(family_group_id)`, `group_memberships(user_id)`, `pipeline_stages(organization_id, position)`,
`deals(organization_id, stage_id)`, `deals(organization_id, owner_id)`, `meetings(organization_id, starts_at)`,
`tasks(organization_id, status, due_on)`, partial `tasks(assignee_id)` for open work,
`audit_logs(family_group_id, created_at)`.

## Deletion rules

Companies cascade to their rows (only by a database administrator; there is no delete UI).
Deleting a group is restricted while companies reference it. Deal deletion needs `crm.manage`;
meetings and tasks keep running if their deal is deleted (`set null`). Stages in use cannot be
deleted (`restrict`).

## Planned domains (not yet created)

Validated per phase before creation, as the brief asks: contacts/leads/consent and outreach
(3); income/expense ledgers, transfers, commissions (4); rental assets, units, tenants, leases,
rent schedules, deposit ledger (5); documents, versions, OCR extractions and field confidence (6);
tax periods, packs, filing statuses, accountant period grants (7); automation definitions,
versions, runs, webhook events (8); AI usage log (9); business-specific modules (10).

## Phases 3–10 (migrations 09–15)

| Domain | Tables | Key rules |
| --- | --- | --- |
| CRM | `contacts`, `suppression_records`, `outreach_sequences`, `outreach_enrollments`, `outreach_events`; `deals.contact_id/setter_id/handed_over_at` | Unique email/phone per company; no enrollment without a lawful basis, for do-not-contact, suppressed, or during an emergency stop; an unsubscribe suppresses and stops sequences |
| Ledger | `legal_entities`, `ledger_entries` | 18 entry types; only approved rows count; approved rows immutable except via `approve_/settle_/reverse_ledger_entry`; approver ≠ creator above the self-approval limit; FX rows need a booked rate; transfers have two legs with a shared `transfer_group_id` |
| Rental | `rental_units`, `tenants`, `leases`, `rent_charges`, `rent_receipts`, `security_deposit_ledger` | One active lease per unit; charges idempotent per period with escalation; receipts cannot exceed due; deposits cannot go negative; receipts and deposit moves append-only; unit expenses are ledger expenses |
| Documents | `documents`, `ocr_extractions`; ledger GST columns and source links | Path must sit under the company folder; allowed types and 15 MB only; same file twice rejected; originals undeletable; an OCR-sourced entry cannot leave draft until the extraction is reviewed |
| Tax | `tax_periods`, `accountant_grants` | "Filed" only through `record_filing` with an acknowledgement; filed periods locked; accountants read only granted entities and dates |
| Automation | `automation_definitions`, `automation_runs`, `webhook_nonces` | Financial ⇒ approval; disabled ⇒ no run; idempotency key unique; runs written only by RPCs or the signed callback; non-idempotent/financial runs never auto-retried |
| AI | `ai_usage_log`, `app_settings.ai_enabled/ai_monthly_token_limit` | Usage logged without prompt content; monthly budget enforced before each call |
| Business | `suppliers`, `products`, `orders`, `order_items`, `commission_agreements`, `commission_receivables`, `properties`, `site_visits`, `ad_approvals`, `outlet_daily_sales` | BIS verified only via `verify_bis` with evidence and future expiry; B2B PO needs the advance; commission only under a signed agreement on a won deal, confirmed with a partner statement ref; ads approved only by compliance roles with verified K-RERA/BIS |
| Audit | `audit_logs` (+ `EXPORT`, `SENSITIVE_READ` actions) | Every table above is audited by trigger; exports logged via `log_export` |
