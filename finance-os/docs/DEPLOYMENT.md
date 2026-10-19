# Deploying GBS Finance OS

This takes about 30 minutes. It uses two free-tier services: a Supabase project (database and
auth) and a Vercel project (the app). Nothing in Phase 2 sends email or WhatsApp to clients.

## 1. Supabase

1. Create a project at supabase.com. Choose region **Mumbai (ap-south-1)** and save the
   database password in your password manager.
2. Apply the migrations from your machine:
   ```bash
   cd finance-os
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push        # applies supabase/migrations in order
   ```
3. **Authentication → Providers → Email**: keep it enabled.
4. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up" once you
   have signed in yourself. Invite colleagues from *Authentication → Users → Invite*.
   You can also set `AUTH_ALLOWED_EMAILS` in Vercel as a second gate.
5. **Authentication → URL Configuration**:
   - Site URL: `https://<your-vercel-domain>`
   - Redirect URLs: `https://<your-vercel-domain>/auth/callback`
6. **Authentication → SMTP** (recommended): Supabase's built-in mailer is rate-limited. Point it at
   Resend's SMTP once Phase 5 sets up the sending domain.
7. **Project Settings → API**: copy the Project URL, the `anon` (publishable) key and the
   `service_role` key.

## 2. Vercel

1. Import the GitHub repo into Vercel and set **Root Directory** to `finance-os`.
   The framework preset is Next.js.
2. Environment variables (Production and Preview):

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key (**not** prefixed `NEXT_PUBLIC_`) |
   | `APP_URL` | `https://<your-vercel-domain>` |
   | `AUTH_ALLOWED_EMAILS` | optional, e.g. `founder@getbeeseen.com` |
   | `SWIPE_API_ENABLED` | `false` until the Swipe checklist passes |
   | `RAZORPAY_*` | optional. See `docs/RAZORPAY.md` (start with test keys) |

3. Deploy, open the site, sign in with your email, and create the **Get Bee Seen** workspace.
   The first person to create it becomes its owner.

## 3. First data

1. Add each retainer client: **Clients → New client**. Include the GSTIN where you have it,
   because it makes Swipe matching exact.
2. Export invoices from Swipe and import them: **Invoices → Import from Swipe**.
3. Check **Tasks** for reconciliation items. These are invoices Swipe marks as paid that have no
   verified payment here yet. Payment recording arrives in Phase 3, so leave them open until then.

## 4. Upgrading

Each phase adds new files under `supabase/migrations/`. Apply them with `npx supabase db push`
**before** deploying the app version that needs them. Migrations only add things and are
tested in CI against a clean database.

## Backups

The Supabase free tier has no point-in-time recovery. Until you are on a paid plan, run a
weekly logical backup:

```bash
npx supabase db dump --linked -f backup-$(date +%F).sql --data-only
```

Store it outside the repository.
