# Security model

## Credentials

**No passwords for social accounts, ever.** The system only holds OAuth tokens
the account owner granted through the platform's own consent screen.

Tokens are sealed with **AES-256-GCM** under a key derived from
`CREDENTIAL_ENCRYPTION_KEY` (`src/core/crypto.js`). The sealed form
`v1.<iv>.<tag>.<ciphertext>` is the only form that touches the database. A fresh
random IV per seal means the same token never produces the same ciphertext, and
the GCM tag means a tampered value fails to decrypt rather than decrypting to
something else.

Tokens are opened in the server process for the duration of one platform call
and are never:

- returned from an API endpoint — `serializeAccount()` is an explicit allowlist,
  and `test/security.test.js` asserts no token material survives serialisation
- written to logs — the logger redacts by key name
- written to the audit trail — `audit()` redacts by key name
- sent to the browser under any circumstance

Rotating `CREDENTIAL_ENCRYPTION_KEY` makes existing sealed tokens unreadable;
accounts must be reconnected. Plan rotation as a re-consent exercise.

## User authentication

Passwords are hashed with **scrypt** (N=16384, r=8, p=1) and a per-user random
salt. Login runs a verification even when the user does not exist, so a missing
account and a wrong password take the same time — no user enumeration by timing.
Repeated failures for one identity are throttled.

Sessions are random 256-bit tokens; only their SHA-256 digest is stored. The
cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` in production.

## Authorisation

Five roles (`src/core/rbac.js`): admin, social media manager, content creator,
reviewer, client. Permissions are `resource:action`; only admin holds a
wildcard. **Every check is server-side.** The frontend hiding a button is a
convenience, never a control.

A user may additionally carry a `client_scope` — a list of client ids they are
confined to. A `client`-role user viewing their own dashboard can reach nothing
else in the agency.

## Tenant isolation

See [ARCHITECTURE.md](ARCHITECTURE.md#tenant-isolation). Two layers: the
repository refuses queries without a tenant predicate, and every client-scoped
request passes through `assertClientAccess`.

## Input and output validation

Request bodies are validated against declared schemas (`src/core/validate.js`)
before a handler sees them. **Model output is validated the same way** — it is
untrusted input too, and an agent whose output fails its schema fails the run
rather than passing malformed data downstream.

SQL is parameterised throughout. `ORDER BY` is the one place a column name
reaches SQL, and it is matched against `/^[a-z_]+ (ASC|DESC)$/` first. Table
names are checked against an allowlist.

## Rate limiting

Two separate mechanisms:

- **API**: coarse per-IP limiting on the HTTP layer (`LIMIT_API_RPM`).
- **Outward actions**: the anti-spam system (`src/core/anti-spam.js`) — hourly
  and daily ceilings, cooldowns, repeated-account detection, duplicate and
  near-duplicate detection, and a circuit breaker that pauses a client's
  automation if activity spikes past twice the configured ceiling.

These ceilings sit deliberately well inside each platform's published limits.
They exist to keep engagement genuine, not to find the platform's edge.

## Static file serving

Paths are normalised and confirmed to resolve inside the web root before being
read. Unknown paths fall back to the SPA shell.

## Secrets management

Nothing in this repository holds a secret. `.env.example` documents every
variable; `assertProductionConfig()` fails at boot rather than at the first
credential write. In production, inject secrets from your platform's secret
manager rather than a file on disk.

## What is deliberately not implemented

No mechanism exists — and none should be added — for:

- storing or using a social account password
- automating a logged-in browser session
- solving or bypassing a CAPTCHA
- calling undocumented or internal platform endpoints
- exceeding or evading a platform's published rate limits
- creating accounts, or acting as an account whose owner did not consent
- generating engagement that misrepresents who is speaking

If a capability is unavailable through an official API, the system reports
`MANUAL_ACTION_REQUIRED` and routes the work to a person. This is a product
decision, not a gap to close later.
