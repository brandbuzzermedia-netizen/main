import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFixture, errorCode, TEST_URL, type Fixture } from "./harness";
import { loadClientAiContext, buildClientContextBlockForTest } from "./ai-helpers";
import { getCredentials } from "@/lib/services/tokens";
import { notifyClient } from "@/lib/engine/notify";

const d = TEST_URL ? describe : describe.skip;

let f: Fixture;

d("client data isolation (RLS)", () => {
  beforeAll(async () => {
    f = await createFixture();
  }, 60_000);
  afterAll(async () => {
    await f?.close();
  });

  it("every tenant table has organization_id + client_id and RLS enabled", async () => {
    const rows = await f.asSystem((db) =>
      db.query<{ table_name: string; has_org: boolean; rls: boolean }>(
        `select c.table_name,
                exists (select 1 from information_schema.columns o where o.table_name = c.table_name and o.column_name = 'organization_id') as has_org,
                (select relrowsecurity from pg_class where relname = c.table_name and relnamespace = 'public'::regnamespace) as rls
         from information_schema.columns c
         where c.table_schema = 'public' and c.column_name = 'client_id'`,
      ),
    );
    expect(rows.length).toBeGreaterThanOrEqual(25);
    for (const r of rows) {
      expect(r.has_org, `${r.table_name} organization_id`).toBe(true);
      expect(r.rls, `${r.table_name} RLS`).toBe(true);
    }
  });

  it("a client owner sees zero rows of another client in every readable table", async () => {
    const tables = await f.asSystem((db) =>
      db.query<{ table_name: string }>(
        `select distinct c.table_name from information_schema.columns c
         where c.table_schema = 'public' and c.column_name = 'client_id'
           and has_table_privilege('gbs_app', format('%I.%I', c.table_schema, c.table_name), 'select')`,
      ),
    );
    expect(tables.length).toBeGreaterThan(20);
    for (const { table_name } of tables) {
      const [other, own] = await f.asUser(f.users.ownerA, async (db) => [
        (await db.one<{ n: number }>(`select count(*)::int as n from ${table_name} where client_id = $1`, [f.B.id]))!.n,
        (await db.one<{ n: number }>(`select count(*)::int as n from ${table_name} where client_id = $1`, [f.A.id]))!.n,
      ]);
      expect(other, `${table_name} leaks client B to owner A`).toBe(0);
      if (table_name !== "audit_logs") expect(own, `${table_name} hides client A from its owner`).toBeGreaterThan(0);
    }
    const clients = await f.asUser(f.users.ownerA, (db) => db.query<{ name: string }>("select name from clients"));
    expect(clients.map((c) => c.name)).toEqual(["Alpha"]);
  });

  it("account managers only see assigned clients; super admins see all", async () => {
    const am = await f.asUser(f.users.amA, (db) => db.query<{ id: string }>("select id from clients"));
    expect(am.map((c) => c.id)).toEqual([f.A.id]);
    const amComments = await f.asUser(f.users.amA, (db) => db.query("select id from comments where client_id = $1", [f.B.id]));
    expect(amComments).toHaveLength(0);
    const admin = await f.asUser(f.users.admin, (db) => db.query<{ id: string }>("select id from clients order by name"));
    expect(admin.map((c) => c.id)).toEqual([f.A.id, f.B.id]);
  });

  it("users cannot write into another client", async () => {
    expect(
      await errorCode(() =>
        f.asUser(f.users.ownerA, (db) =>
          db.query(
            `insert into brand_documents (organization_id, client_id, kind, title, file_name, mime_type, size_bytes, content_text)
             values ($1, $2, 'marketing', 'x', 'x', 'text/plain', 1, 'x')`,
            [f.org, f.B.id],
          ),
        ),
      ),
    ).toBe("42501");
    const updated = await f.asUser(f.users.amA, (db) =>
      db.query("update campaigns set name = 'hijacked' where client_id = $1 returning id", [f.B.id]),
    );
    expect(updated).toHaveLength(0);
    const deleted = await f.asUser(f.users.ownerA, (db) => db.query("delete from audience_segments where client_id = $1 returning id", [f.B.id]));
    expect(deleted).toHaveLength(0);
  });

  it("composite foreign keys reject cross-client references even for the service role", async () => {
    expect(
      await errorCode(() =>
        f.asSystem((db) =>
          db.query(`insert into campaign_segments (organization_id, client_id, campaign_id, segment_id) values ($1, $2, $3, $4)`, [
            f.org,
            f.A.id,
            f.A.campaign,
            f.B.segment,
          ]),
        ),
      ),
    ).toBe("23503");
    expect(
      await errorCode(() =>
        f.asSystem((db) =>
          db.query(
            `insert into engagement_opportunities (organization_id, client_id, campaign_id, post_id, platform) values ($1, $2, $3, $4, 'instagram')`,
            [f.org, f.A.id, f.A.campaign, f.B.post],
          ),
        ),
      ),
    ).toBe("23503");
  });

  it("tenancy columns are immutable", async () => {
    expect(
      await errorCode(() => f.asSystem((db) => db.query("update comments set client_id = $1 where id = $2", [f.B.id, f.A.comment]))),
    ).not.toBeNull();
  });

  it("secrets are invisible to request queries", async () => {
    for (const t of ["oauth_tokens", "oauth_states", "sessions", "rate_limits"]) {
      expect(await errorCode(() => f.asUser(f.users.admin, (db) => db.query(`select * from ${t}`))), t).toBe("42501");
    }
    expect(await errorCode(() => f.asUser(f.users.admin, (db) => db.query("select password_hash from users")))).toBe("42501");
  });

  it("OAuth credentials are bound to their client", async () => {
    const creds = await f.asSystem((db) => getCredentials(db, { clientId: f.A.id, socialAccountId: f.A.account }));
    expect(creds.accessToken).toBe("token-Alpha");
    await expect(f.asSystem((db) => getCredentials(db, { clientId: f.A.id, socialAccountId: f.B.account }))).rejects.toThrow();
    // Copy B's ciphertext onto A's account: decryption must fail because the AAD binding differs.
    await f.asSystem((db) =>
      db.query(
        `update oauth_tokens set access_token_enc = (select access_token_enc from oauth_tokens where social_account_id = $2) where social_account_id = $1`,
        [f.A.account, f.B.account],
      ),
    );
    await expect(f.asSystem((db) => getCredentials(db, { clientId: f.A.id, socialAccountId: f.A.account }))).rejects.toThrow();
  });

  it("AI context contains only the requested client's data", async () => {
    const ctx = await f.asUser(f.users.admin, (db) => loadClientAiContext(db, { clientId: f.A.id, campaignId: f.A.campaign }));
    const block = buildClientContextBlockForTest(ctx);
    expect(block).toContain("Alpha SECRET GUIDELINES");
    expect(block).not.toContain("Bravo");
    // Asking for client A with client B's campaign is refused.
    await expect(f.asUser(f.users.admin, (db) => loadClientAiContext(db, { clientId: f.A.id, campaignId: f.B.campaign }))).rejects.toThrow(
      /does not belong/,
    );
    // An account manager of B cannot build A's context at all.
    await expect(f.asUser(f.users.amB, (db) => loadClientAiContext(db, { clientId: f.A.id, campaignId: f.A.campaign }))).rejects.toThrow();
  });

  it("notifications for a client reach only that client's people", async () => {
    await f.asSystem((db) =>
      notifyClient(db, {
        organizationId: f.org,
        clientId: f.A.id,
        kind: "approval_required",
        title: "test-iso",
        audience: ["managers", "client_approvers"],
      }),
    );
    const recipients = await f.asSystem((db) => db.query<{ user_id: string }>("select user_id from notifications where title = 'test-iso'"));
    const ids = recipients.map((r) => r.user_id).sort();
    expect(ids).toEqual([f.users.amA, f.users.ownerA].sort());
    const seenByB = await f.asUser(f.users.ownerB, (db) => db.query("select id from notifications where title = 'test-iso'"));
    expect(seenByB).toHaveLength(0);
  });
});
