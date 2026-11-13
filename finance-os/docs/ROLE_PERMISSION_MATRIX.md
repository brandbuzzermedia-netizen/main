# Roles and permissions

The database is the source of truth: `public.permissions`, `public.role_permissions` and
`app.has_permission(company, key)`. The UI reads the same set through `my_permissions(company)`
to decide what to offer; RLS enforces it again on every read and write.

## Group roles (`group_memberships`)

| Role | Can |
| --- | --- |
| `group_owner` | Command Centre; add businesses; set ownership/consolidation; grant group roles; manage members of any company in the group (audited). |
| `family_owner` | Command Centre and registry. Company figures only where they also hold a company membership. |
| `group_viewer` | Registry only. |

Group roles are granted only by a group owner. A company owner or admin cannot grant them.
Company membership never implies group access.

## Company roles (`memberships`)

| Permission | owner | company_admin | finance | viewer | sales_manager | sales_rep | account_manager | operations_manager | marketing_manager | staff | accountant | partner |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| company.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| company.settings | ✓ | ✓ | | | | | | | | | | |
| company.emergency_stop | ✓ | ✓ | | | | | | | | | | |
| members.manage | ✓ | ✓ | | | | | | | | | | |
| members.grant_owner | ✓ | | | | | | | | | | | |
| dashboard.owner | ✓ | ✓ | | | | | | | | | | |
| finance.read | ✓ | | ✓ | ✓ | | | | | | | | |
| finance.write | ✓ | | ✓ | | | | | | | | | |
| crm.read_all | ✓ | ✓ | | | ✓ | | | | ✓ | | | |
| crm.read_assigned | | | | | | ✓ | ✓ | ✓ | | ✓ | | |
| crm.read_shared | | | | | | | | | | | | ✓ |
| crm.write (own unless read_all) | ✓ | ✓ | | | ✓ | ✓ | ✓ | ✓ | ✓ | | | |
| crm.manage | ✓ | ✓ | | | ✓ | | | | | | | |
| tasks.read_all | ✓ | ✓ | | | ✓ | | | ✓ | | | | |
| tasks.write (own) | ✓ | ✓ | ✓ | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | |
| audit.read | ✓ | ✓ | | | | | | | | | | |

Notes

* Finance is separate from sales: a company admin or sales manager sees no ledger by default.
* `accountant` currently has no data access. Phase 7 adds entity and period grants.
* `partner` sees only deals in `deal_shares`; no tasks, meetings, finance or roster beyond names.
* Narrower permissions for salary, tax IDs, bank data, partner terms and owner distributions are
  added with those tables (phases 4–7), not folded into `finance.read`.

## Verified by `supabase/tests/07_group_foundation.sql`

GBS sales rep cannot read Vyra Studio, finance or the group, nor hand deals to others; Vyra staff
cannot read GBS deals or finance; company admin cannot grant owner, self-promote, grant any
group role, move the company to another group or edit consolidation; partner sees only the
shared deal and cannot edit it; finance user reads finance but not deals; accountant reads
nothing; outsiders see nothing and cannot join or add companies; family owner sees the registry
but no records and cannot grant themselves access; last owners are protected; records cannot be
assigned to non-members or use another company's stages; emergency stop and group grants are
audited.

## Not yet done (Phase 1 remainder)

Email invitations for people who have never signed in, deactivation without deleting membership,
session revocation, MFA for privileged roles (Supabase Auth supports TOTP MFA; to be enforced
for owners and finance), and audit of sensitive reads and exports.

## Permissions added in Phases 3–10

| Permission | Granted to |
| --- | --- |
| finance.approve | owner |
| finance.sensitive | owner, finance |
| rental.read | owner, finance, viewer |
| rental.write | owner, finance |
| documents.read | owner, company_admin, finance, viewer |
| documents.write | owner, company_admin, finance, operations_manager, sales_manager, staff |
| automation.manage | owner, company_admin |
| automation.approve | owner |
| operations.read | owner, company_admin, operations_manager, sales_manager, marketing_manager, staff, finance |
| operations.write | owner, company_admin, operations_manager |
| compliance.verify | owner, company_admin |

Accountants read ledger rows only for entities and dates in their `accountant_grants`, and may
move their assigned tax periods through review, never to "filed". Partner terms
(`commission_agreements`) need `finance.sensitive`. Restricted vault documents need
`finance.sensitive` even with `documents.read`.
