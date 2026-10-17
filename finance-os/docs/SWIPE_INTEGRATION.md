# Swipe integration: Phase 1 findings

Status: **research complete. The capability on GBS's own account is NOT verified yet.**
Research date: 2026-10-17.

## How this was researched

The build sandbox's network policy blocks `developers.getswipe.in` and `getswipe.in`,
so the pages could not be fetched directly. The findings below come from search-engine
extracts of Swipe's official developer docs. Every item is tagged:

- **Documented**: appears in Swipe's official developer docs. The path or name was seen in an extract.
- **Unverified**: implied by the docs but not confirmed. Confirm it in the API Playground before relying on it.
- **Unknown**: nothing public found.

Nothing below has been tested against a real Swipe account. Per the build brief, no
endpoint is implemented as working until it has been called with GBS's real key.

## What Swipe's developer API documents

| Area | Finding | Status |
| --- | --- | --- |
| Docs site | `https://developers.getswipe.in` (Mintlify). Index at `/llms.txt` | Documented |
| Auth | API key generated in the Swipe dashboard → **API Integration** section, sent as `Authorization: Bearer <key>` | Documented |
| Base path | `/api/partner/v1/...` (V2 groups also exist) | Documented |
| Documents (invoices) | Document V2: `POST` create, `GET` get one, `GET` document PDF, `PUT` edit, `DEL` cancel, `GET` **list of documents** | Documented (list params unverified) |
| Document create | `POST /api/partner/v1/doc`, `document_type` ∈ invoice, subscription, pro_forma_invoice, estimate, sales_return, purchase_return. `document_date` format `DD-MM-YYYY`. Optional `payments[]` | Documented |
| Payments | Payment V2: `GET` list of payments | Documented (response shape unclear) |
| Customer ledger | `GET /api/partner/v1/customer/ledger`: payment entries, closing balance, paid flag | Documented |
| Customers / vendors / products / subscriptions | CRUD + list groups exist | Documented |
| Webhooks | "How Webhooks Work", "Available Event Types" (**Document events**, Inventory events), "Verifying Webhook Signatures", "Setting Up Webhooks" | Documented as a section. **Whether payment events exist is unknown** |
| Rate limits | — | Unknown |
| Plan gating | No public statement on which plan includes API access | **Unknown** |
| Invoice export (CSV/Excel) | A Swipe app listing lists "invoice export" among add-ons you request from support@getswipe.in | Unverified. May not be on the free plan |

Contacts: `api@getswipe.in` (API questions, per the Swipe community), `support@getswipe.in`.

## Consequence for the design

We **cannot assume** the free plan has the API, webhooks or bulk export. The app is built
so that the invoice ledger doesn't care where an invoice came from:

```
          ┌───────────────────────── InvoiceSource adapter ─────────────────────────┐
Swipe API ─┤ SwipeApiSource      (priority 1: only enabled after a live key test)    │
Swipe CSV ─┤ SwipeCsvSource      (priority 2: exported file, validated + de-duped)   ├─► integration_sync_runs
Manual    ─┤ ManualEntrySource   (priority 3: form keyed from the Swipe invoice)     │    integration_events
          └──────────────────────────────────────────────────────────────────────────┘    invoices (upsert)
```

Every adapter produces the same normalized `InvoiceRecord`. Each invoice row carries:

- `source_system` (`swipe`), `source_channel` (`api` | `csv` | `manual`)
- `external_id` (Swipe document ID, when known), `invoice_number` (always)
- a unique key on `(organization_id, source_system, invoice_number)` so a CSV row, a
  manual entry and a later API pull of the same invoice **merge, not duplicate**
- `last_synced_at`, `sync_status` (`current` | `stale` | `error` | `manual`)

Switching from CSV to the API later is configuration only. It needs no schema change.

**Staleness is shown, not hidden.** The dashboard shows a sync banner when the last
successful sync for the active channel is older than its threshold (API: 6 h,
CSV/manual: 7 days, configurable), or when the last run failed.

**Reminders never trust Swipe's paid flag alone.** The outstanding balance is computed from
our own *verified* payment allocations. A Swipe "paid" status that disagrees with our
ledger opens a reconciliation item. It does not silently mark the invoice paid.

**Prohibited, per the brief:** browser scraping, stored-password login automation, and
inventing endpoints. The API adapter ships behind `SWIPE_API_ENABLED=false` and is
switched on only after the connection test below passes.

## Verification checklist for the founder (about 10 minutes)

These answers decide which adapter goes live first:

1. In Swipe, open **Settings → API Integration** (or search the dashboard for "API").
   - Can you generate a key on your current plan? Yes / No / "Upgrade required"
2. If a key is available, open the API Playground at developers.getswipe.in, paste the key,
   and run **GET List of documents**. Does it return your invoices?
3. Check whether the dashboard has a **Webhooks** setting, and which events it lists.
4. In the invoice list, check for a **Download / Export** (Excel/CSV) option on your plan.
5. Optional: email api@getswipe.in and ask which plan includes API and webhook access,
   and whether there's a separate fee.

Decision table:

| Key works (1–2) | Export works (4) | Go-live path |
| --- | --- | --- |
| Yes | — | API pull every 6 h through n8n, plus webhooks if available. CSV kept as fallback |
| No | Yes | Weekly CSV import with validation and duplicate detection |
| No | No | Manual entry form (invoice number, date, due date, amount, PDF link) at invoice creation time, plus a weekly reconciliation prompt |

## Sources

- Swipe developer docs: [Introduction](https://developers.getswipe.in/introduction),
  [Create a document](https://developers.getswipe.in/api-reference/document/create-a-document),
  [Payment](https://developers.getswipe.in/payment),
  [Get payment ledger](https://developers.getswipe.in/api-reference/customer/get-payment-ledger),
  [Subscriptions](https://developers.getswipe.in/subscriptions),
  [Product](https://developers.getswipe.in/product)
- [Swipe API Integration page](https://getswipe.in/apis)
- [Swipe community: "I need API integration document"](https://community.getswipe.in/t/i-need-api-integration-document/1661)
- [Swipe on the Shopify App Store (add-ons list)](https://apps.shopify.com/swipe-1)
