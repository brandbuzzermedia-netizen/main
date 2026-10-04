# GBS Engagement Engine

Internal Get Bee Seen platform for AI-assisted, **human-approved** social engagement
across many clients from one dashboard. Every client is isolated: its own accounts,
brand voice, audiences, comments, analytics and AI context.

Next.js 16 · TypeScript · PostgreSQL (Supabase-compatible) with Row Level Security ·
Claude (`claude-opus-5-5` by default) · Tailwind 4.

| Doc | What it covers |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | Stack, tenancy model, the four isolation layers, pipeline, security |
| [docs/database-schema.md](docs/database-schema.md) | Tables, RLS helpers and policies, integrity triggers |
| [docs/platform-capabilities.md](docs/platform-capabilities.md) | What each platform's official API allows, and the limits |
| [docs/implementation-plan.md](docs/implementation-plan.md) | MVP scope, module order, what's deferred |

## Run it locally

Needs Node 22+ and PostgreSQL 15+.

```bash
cp .env.example .env.local        # set DATABASE_URL and TOKEN_ENCRYPTION_KEY (openssl rand -base64 32)
npm install
npm run db:migrate                # applies db/migrations/*.sql once each
SEED_DEMO_PASSWORD=choose-one npm run db:seed   # optional demo data (refuses to run in production)
npm run dev                       # http://localhost:3000
npm run worker                    # publishing queue, scheduled discovery, metrics, daily reports
```

Demo logins after seeding (password = `SEED_DEMO_PASSWORD`):

| Email | Role |
| --- | --- |
| `admin@getbeeseen.com` | GBS super admin |
| `mehul@getbeeseen.com` | Account manager — Wudgres, Thrishank, Bharatwood |
| `priya@getbeeseen.com` | Account manager — Lykes, Assetz |
| `owner@wudgres.example` | Client owner (Wudgres) |
| `team@wudgres.example` | Client team member (Wudgres) — suggests edits only |
| `owner@lykes.example` | Client owner (Lykes) — sees nothing of Wudgres |

Brand documents can be PDF, Word (.docx) or text files; their text is extracted on
upload and used as AI context for that client only.

Seeded social accounts are marked **demo**: they have no tokens, so discovery skips
them and their comments go to "manual action" in the publishing queue. Connect real
accounts from a client's **Social accounts** page once the platform apps are set up.

Without `ANTHROPIC_API_KEY` the app uses an **offline draft** provider (template
comments from the post's own words) so the workflow can be exercised. Production
refuses to start generation without a key unless `ALLOW_OFFLINE_AI=true`.

## Tests

```bash
npm run typecheck
npm run lint
npm test                                                        # unit tests; DB tests skip without a database
TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres npm test   # + RLS / isolation / workflow tests
```

The database tests create a throwaway database, apply every migration, load two
clients with a row in every tenant table, and check that no role can read or write
across clients, that cross-client foreign keys are rejected, that secrets are
invisible to request queries, that tokens are bound to their client, and that the
approval rules are enforced by the database itself.

## Deploying (Render + Supabase)

The repository's `render.yaml` defines the engine as a **web service** and a
**background worker** sharing one environment group.

1. **Database.** Create a Supabase project (or any PostgreSQL 15+ whose user can create
   roles). Copy the connection string (session-mode pooler) — that's `DATABASE_URL`.
   Optionally download its CA certificate and set `DATABASE_CA_CERT` to verify TLS.
2. **Render.** New → Blueprint → this repository. Fill in `DATABASE_URL` and `APP_URL`
   (the web service's public URL, e.g. `https://gbs-engagement-engine.onrender.com`).
   `TOKEN_ENCRYPTION_KEY` is generated for you. **Never change it once accounts are
   connected** — stored tokens could no longer be decrypted.
3. **First deploy.** Migrations run automatically before each deploy
   (`preDeployCommand`). Then open the web service's **Shell** and create the first login:
   ```bash
   ADMIN_EMAIL=you@getbeeseen.com ADMIN_NAME="Your Name" npm run bootstrap
   ```
   It prints a one-time password; change it under **Your account** after signing in.
4. **AI.** Set `ANTHROPIC_API_KEY`. Model and effort are chosen under Settings.
5. **Platforms.** Create the Meta app (Facebook Login for Business + Instagram API) and a
   LinkedIn app (Community Management API for company pages), get the permissions in
   `docs/platform-capabilities.md` approved, set their keys, and register the redirect
   URIs `${APP_URL}/api/oauth/instagram/callback`, `…/facebook/callback` and
   `…/linkedin/callback`.
6. **Email (optional).** Set `RESEND_API_KEY` and `EMAIL_FROM` (a sender on a domain
   verified in Resend). The worker then emails approvals waiting, publishing failures,
   expired connections and daily reports; users can opt out under Your account.

Other hosts: any Node 22 host works (`npm run build && npm start`, plus `npm run worker`).
On serverless hosts without a long-running worker, call
`POST /api/cron/{publish|email|discovery|metrics|reports}` with
`Authorization: Bearer $CRON_SECRET` on a schedule (publish and email every minute,
discovery hourly, metrics every few hours, reports daily).

## Layout

```
db/migrations/        schema, RLS, triggers
scripts/              migrate, seed, worker
src/app/              routes: (app)/… pages, actions/ server actions, api/ OAuth + cron
src/components/       UI kit, charts, approval queue, app shell + client switcher
src/lib/platforms/    SocialPlatformAdapter + Instagram, Facebook, LinkedIn, YouTube, X, TikTok
src/lib/ai/           per-client context loader, prompts, Claude + offline providers, embeddings
src/lib/engine/       discovery, scoring, quality, approvals, workflow, publisher, metrics, reports
tests/unit, tests/db  vitest
```
