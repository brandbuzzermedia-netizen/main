# Decisions

**D1. Build Diwani Parivaar OS by evolving `finance-os`, not a new app.** It already has a sound
Next.js 16 + Supabase stack, a tested receivables ledger, RLS with anon lockdown, and CI. A new
app would duplicate auth and finance and split the data. The folder name stays for Vercel
continuity; the product is renamed in the UI.

**D2. `organizations` is the company workspace.** Renaming it to `companies` would touch every
policy, function and query in the finance ledger for no behavioural gain. Docs and UI call it a
company. Legal entities will be a separate table in Phase 4 because one company can have one or
more legal entities and vice versa only rarely.

**D3. Group access and company access are separate memberships.** A group role shows the
registry and the Command Centre shell; figures need company membership with the relevant
permission. This satisfies "company membership does not imply group access" and the reverse,
and keeps La Pino'z (brother's) and Vyra Studio (mother's) data private unless their owners grant
access. A group owner *can* add themselves to a company, and that grant is audited.

**D4. Permissions are data.** `role_permissions` maps roles to permission keys and
`app.has_permission` is used by RLS. The original helpers (`can_write`, `can_read_finance`) now
resolve through it with identical results for the original roles, proven by the existing SQL tests.

**D5. Only `consolidated` companies add into group totals.** Partner channels count only
contracted commission (their pipeline is partner gross value, shown separately as "not income"),
joint ventures need the agreed share, and anything unconfirmed is listed separately. Group owners
set this; company admins cannot.

**D6. No invented data.** Templates for the 11 named workspaces carry configuration only. The
unnamed tenth Mehul business is not created; "Add a business" exists instead. Stage probabilities
default to 0, so the weighted forecast reads "set stage probabilities" until the owner configures it.
Demo data exists only in development, prefixed `[DEMO]`, in an `is_demo` group with a banner.

**D7. Finance pages keep their URLs for now** and act on an active-company cookie set only by
`/switch` after a membership check. Moving them under `/c/[slug]/finance` is scheduled (roadmap)
so the company is always visible in the URL.

**D8. Timestamps compare as instants; periods are IST dates.** PostgREST returns mixed offsets,
so comparisons parse to instants, and period membership uses the India calendar date.

**D9. Unbuilt modules are visible but disabled** (with the phase they arrive in) to owners only,
so every visible action works or says why not, and employees see a shorter menu.

**D10. One shared ledger, separate from the invoice receivables module.** The original Swipe
invoice ledger stays the record of sales invoices and receipts. The general ledger holds
expenses, other and commission income, financing, deposits, pass-through funds and tax. The
Command Centre shows the two side by side with their sources and never adds them together, so a
receipt entered in both places cannot be counted twice.

**D11. Rental income lives in its own subledger.** Charges (accrual), receipts (cash) and the
deposit ledger (liability) are separate tables; the ledger refuses income rows tagged with a
rental unit, so rent cannot be booked twice. Unit expenses are ledger expenses tagged with the unit.

**D12. Compliance gates are database rules, set through RPCs.** BIS verification, K-RERA
verification, filing a return and approving ledger entries can only happen through functions
that check the permission and the evidence. A direct table update is refused even for a user who
can write the table.

**D13. AI and automation degrade to labelled mock mode.** Without credentials nothing is
invented: OCR returns empty fields for manual entry, drafting is unavailable, and test runs say
"mock". Live behaviour starts only when keys are configured and a company opts in.

**D14. Simple record screens are configuration.** `src/lib/resources.ts` describes tables,
columns, fields and permissions; one server action and one page serve them. The table name never
comes from the request and `organization_id` is always set server-side.
