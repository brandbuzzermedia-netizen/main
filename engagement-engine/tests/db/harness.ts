import { randomBytes } from "node:crypto";
import { Client, Pool } from "pg";
import { migrate } from "../../scripts/migrate";
import { withSystemOn, withUserOn, type Db } from "@/lib/db";
import { encryptSecret, tokenBinding } from "@/lib/security/crypto";

/**
 * Creates a throwaway database, applies every migration, and loads two clients (A and B)
 * with a row in every tenant table, plus users for each role.
 * Requires TEST_DATABASE_URL pointing at a server where we may CREATE DATABASE.
 */
export const TEST_URL = process.env.TEST_DATABASE_URL;

export interface Fixture {
  pool: Pool;
  dbName: string;
  org: string;
  users: Record<"admin" | "amA" | "amB" | "ownerA" | "memberA" | "ownerB", string>;
  A: ClientFixture;
  B: ClientFixture;
  asUser<T>(user: string, fn: (db: Db) => Promise<T>): Promise<T>;
  asSystem<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export interface ClientFixture {
  id: string;
  segment: string;
  campaign: string;
  account: string;
  post: string;
  opportunity: string;
  comment: string;
  approvedComment: string;
}

export async function createFixture(): Promise<Fixture> {
  if (!TEST_URL) throw new Error("TEST_DATABASE_URL not set");
  const dbName = `gbs_test_${randomBytes(4).toString("hex")}`;
  const admin = new Client({ connectionString: TEST_URL });
  await admin.connect();
  await admin.query(`create database ${dbName}`);
  await admin.end();
  const url = new URL(TEST_URL);
  url.pathname = `/${dbName}`;
  await migrate(url.toString(), () => {});
  const pool = new Pool({ connectionString: url.toString(), max: 4 });
  const asSystem = <T>(fn: (db: Db) => Promise<T>) => withSystemOn(pool, fn);
  const asUser = <T>(user: string, fn: (db: Db) => Promise<T>) => withUserOn(pool, user, fn);

  const f = await asSystem(async (db) => {
    const org = (await db.one<{ id: string }>(`insert into organizations (name, slug) values ('Get Bee Seen', 'gbs') returning id`))!.id;
    const mkUser = async (email: string, role: string) =>
      (await db.one<{ id: string }>(
        `insert into users (organization_id, email, full_name, password_hash, platform_role) values ($1, $2, $2, 'x', $3) returning id`,
        [org, email, role],
      ))!.id;
    const users = {
      admin: await mkUser("admin@gbs.test", "super_admin"),
      amA: await mkUser("am.a@gbs.test", "account_manager"),
      amB: await mkUser("am.b@gbs.test", "account_manager"),
      ownerA: await mkUser("owner@a.test", "client_user"),
      memberA: await mkUser("member@a.test", "client_user"),
      ownerB: await mkUser("owner@b.test", "client_user"),
    };

    const mkClient = async (name: string, am: string, owner: string, member?: string): Promise<ClientFixture> => {
      const id = (await db.one<{ id: string }>(
        `insert into clients (organization_id, name, slug, status, approval_mode) values ($1, $2, $3, 'active', 'manual') returning id`,
        [org, name, name.toLowerCase()],
      ))!.id;
      await db.query(`insert into account_managers (organization_id, client_id, user_id, is_primary) values ($1, $2, $3, true)`, [org, id, am]);
      await db.query(`insert into client_users (organization_id, client_id, user_id, role, can_approve, can_edit) values ($1, $2, $3, 'owner', true, true)`, [
        org,
        id,
        owner,
      ]);
      if (member) {
        await db.query(`insert into client_users (organization_id, client_id, user_id, role) values ($1, $2, $3, 'member')`, [org, id, member]);
      }
      await db.query(`insert into brand_profiles (organization_id, client_id, company_name, tone) values ($1, $2, $3, '{Professional}')`, [org, id, name]);
      await db.query(
        `insert into brand_documents (organization_id, client_id, kind, title, file_name, mime_type, size_bytes, content_text)
         values ($1, $2, 'brand_guidelines', 'Guide', 'g.md', 'text/markdown', 10, $3)`,
        [org, id, `${name} SECRET GUIDELINES`],
      );
      const segment = (await db.one<{ id: string }>(
        `insert into audience_segments (organization_id, client_id, name, job_titles) values ($1, $2, 'Architects', '{Architect}') returning id`,
        [org, id],
      ))!.id;
      await db.query(`insert into audience_keywords (organization_id, client_id, segment_id, keyword) values ($1, $2, $3, 'villa')`, [org, id, segment]);
      const target = (await db.one<{ id: string }>(
        `insert into target_profiles (organization_id, client_id, platform, handle) values ($1, $2, 'instagram', 'studio') returning id`,
        [org, id],
      ))!.id;
      const campaign = (await db.one<{ id: string }>(
        `insert into campaigns (organization_id, client_id, name, platforms, status) values ($1, $2, 'Main', '{instagram}', 'active') returning id`,
        [org, id],
      ))!.id;
      await db.query(`insert into campaign_segments (organization_id, client_id, campaign_id, segment_id) values ($1, $2, $3, $4)`, [org, id, campaign, segment]);
      await db.query(
        `insert into campaign_target_profiles (organization_id, client_id, campaign_id, target_profile_id) values ($1, $2, $3, $4)`,
        [org, id, campaign, target],
      );
      const account = (await db.one<{ id: string }>(
        `insert into social_accounts (organization_id, client_id, platform, external_account_id, handle) values ($1, $2, 'instagram', $3, $3) returning id`,
        [org, id, `${name}-ig`],
      ))!.id;
      await db.query(
        `insert into oauth_tokens (organization_id, client_id, social_account_id, access_token_enc) values ($1, $2, $3, $4)`,
        [org, id, account, encryptSecret(`token-${name}`, tokenBinding(id, account))],
      );
      await db.query(
        `insert into oauth_states (state_hash, organization_id, client_id, user_id, platform, expires_at) values ($1, $2, $3, $4, 'instagram', now() + interval '10 minutes')`,
        [`state-${name}`, org, id, owner],
      );
      const post = (await db.one<{ id: string }>(
        `insert into posts (organization_id, client_id, platform, external_post_id, content) values ($1, $2, 'instagram', 'p1', 'Luxury villa entrance') returning id`,
        [org, id],
      ))!.id;
      const opportunity = (await db.one<{ id: string }>(
        `insert into engagement_opportunities (organization_id, client_id, campaign_id, post_id, platform, score) values ($1, $2, $3, $4, 'instagram', 80) returning id`,
        [org, id, campaign, post],
      ))!.id;
      const gen = (await db.one<{ id: string }>(
        `insert into comment_generations (organization_id, client_id, campaign_id, opportunity_id, provider, model, prompt_version, context_hash)
         values ($1, $2, $3, $4, 'test', 'test', 'v1', 'h') returning id`,
        [org, id, campaign, opportunity],
      ))!.id;
      const mkComment = async (text: string) =>
        (await db.one<{ id: string }>(
          `insert into comments (organization_id, client_id, campaign_id, opportunity_id, generation_id, social_account_id, platform, comment_type,
             original_text, current_text, status, quality_passed)
           values ($1, $2, $3, $4, $5, $6, 'instagram', 'insight', $7, $7, 'pending_approval', true) returning id`,
          [org, id, campaign, opportunity, gen, account, text],
        ))!.id;
      const comment = await mkComment(`${name} comment pending`);
      const approvedComment = await mkComment(`${name} comment approved`);
      await db.query(
        `insert into comment_approvals (organization_id, client_id, comment_id, approver_id, approver_side, decision) values ($1, $2, $3, $4, 'client', 'approved')`,
        [org, id, approvedComment, owner],
      );
      await db.query(`update comments set status = 'approved' where id = $1`, [approvedComment]);
      await db.query(
        `insert into comment_edits (organization_id, client_id, comment_id, kind, previous_text, new_text, editor_id) values ($1, $2, $3, 'suggestion', 'a', 'b', $4)`,
        [org, id, comment, owner],
      );
      const job = (await db.one<{ id: string }>(
        `insert into publishing_jobs (organization_id, client_id, comment_id, social_account_id, platform) values ($1, $2, $3, $4, 'instagram') returning id`,
        [org, id, approvedComment, account],
      ))!.id;
      await db.query(
        `insert into publishing_results (organization_id, client_id, job_id, comment_id, success) values ($1, $2, $3, $4, false)`,
        [org, id, job, approvedComment],
      );
      await db.query(`insert into engagement_metrics (organization_id, client_id, social_account_id, platform, followers) values ($1, $2, $3, 'instagram', 10)`, [
        org,
        id,
        account,
      ]);
      await db.query(`insert into usage_limits (organization_id, client_id) values ($1, $2)`, [org, id]);
      await db.query(`insert into usage_events (organization_id, client_id, kind) values ($1, $2, 'ai_generation')`, [org, id]);
      await db.query(`insert into notifications (organization_id, client_id, user_id, kind, title) values ($1, $2, $3, 'daily_report', 'r')`, [org, id, owner]);
      await db.query(`insert into daily_reports (organization_id, client_id, report_date, data) values ($1, $2, current_date, '{}')`, [org, id]);
      await db.query(
        `insert into audit_logs (organization_id, client_id, actor_id, actor_name, action, entity_type) values ($1, $2, $3, 'x', 'client.created', 'client')`,
        [org, id, users.admin],
      );
      return { id, segment, campaign, account, post, opportunity, comment, approvedComment };
    };

    const A = await mkClient("Alpha", users.amA, users.ownerA, users.memberA);
    const B = await mkClient("Bravo", users.amB, users.ownerB);
    return { org, users, A, B };
  });

  return {
    pool,
    dbName,
    ...f,
    asUser,
    asSystem,
    async close() {
      await pool.end();
      const c = new Client({ connectionString: TEST_URL });
      await c.connect();
      await c.query(`drop database if exists ${dbName} with (force)`);
      await c.end();
    },
  };
}

/** Runs fn and returns the Postgres error code it failed with (or null if it succeeded). */
export async function errorCode(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? (e as Error).message;
  }
}
