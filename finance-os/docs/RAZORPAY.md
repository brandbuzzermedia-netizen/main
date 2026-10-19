# Razorpay setup

Finance OS creates a Razorpay **payment link** for an invoice's outstanding balance and records the
payment automatically when Razorpay's **signed webhook** reports it. Swipe stays the invoicing
system; Razorpay only collects the money.

## What happens

1. On an invoice, *Create Razorpay link* calls `POST /v1/payment_links` for the current outstanding
   balance. The link is tied to the invoice through its `reference_id` and notes. Razorpay's own
   SMS and email notifications are turned off; Finance OS sends the reminders (Phase 5).
2. The client pays by UPI, card or netbanking.
3. Razorpay calls `https://<your-app>/api/webhooks/razorpay` with `payment_link.paid`. Finance OS:
   - checks the `X-Razorpay-Signature` HMAC against the raw body. Unsigned or tampered calls get a 401
     and change nothing.
   - records the event id once. Razorpay's retries return `duplicate_event`.
   - records a **verified** receipt with the Razorpay payment id (`pay_…`) as its reference and
     allocates it to the invoice up to its open balance. Any excess stays unallocated, and a payment
     id is never recorded twice.
   - marks the link paid and closes any Swipe reconciliation task the payment resolves.
4. Razorpay later settles to your bank in batches, net of fees. Bank-statement lines from Razorpay
   are recognised and **skipped** on import, because each client payment is already recorded. Without
   this the money would be counted twice. Gateway fees are tracked as expenses in Phase 4.

If the balance changes after a link was made (for example a partial bank transfer), the invoice page
says so; use *Replace link*, which cancels the old link at Razorpay first.

## Setup (test mode first)

1. **API keys**: Razorpay Dashboard → switch to **Test Mode** → Account & Settings → API Keys →
   Generate. You get a key id `rzp_test_…` and a key secret.
2. **Webhook**: Dashboard → Settings (Account & Settings) → Webhooks → Add New Webhook.
   - Webhook URL: `https://<your-app>/api/webhooks/razorpay` (shown on the app's Integrations page)
   - Secret: a long random string you choose. It is **not** the API key secret.
   - Active events: `payment_link.paid`, `payment_link.partially_paid`, `payment_link.expired`,
     `payment_link.cancelled`
3. **Environment** (Vercel → Settings → Environment Variables):

   | Name | Value |
   | --- | --- |
   | `RAZORPAY_ENABLED` | `true` |
   | `RAZORPAY_KEY_ID` | `rzp_test_…` |
   | `RAZORPAY_KEY_SECRET` | key secret |
   | `RAZORPAY_WEBHOOK_SECRET` | the webhook secret from step 2 |
   | `RAZORPAY_LINK_VALIDITY_DAYS` | optional, default `30` |

   Never set `RAZORPAY_API_BASE`; it exists only for automated tests.
4. Redeploy, open an invoice, create a link, and pay it with Razorpay's test UPI or test card.
   Within seconds the invoice should show the payment as verified. **Integrations** shows the last
   webhook event received.
5. Once a test payment has gone through end to end, repeat steps 1–3 in **Live Mode** with
   `rzp_live_…` keys and a live webhook. The app shows a "test mode" badge on every link until then.

## Status of this integration

- **Tested here:**
  - signature verification and event parsing (unit tests);
  - the database side (`supabase/tests/06_razorpay.sql`): recording, duplicate deliveries, the same
    payment arriving in two events, overpayment, unknown links, expiry, and access control;
  - a full run of the app against a **local stand-in for Razorpay's API**: create link, signed
    webhook, invoice settled, retry ignored, forged signature rejected.
- **Not tested yet:** against Razorpay itself. The build environment cannot reach Razorpay, and
  no keys were available. The `payment_link.paid` field layout follows Razorpay's documentation and
  is parsed defensively. Run step 4 in test mode before going live.
