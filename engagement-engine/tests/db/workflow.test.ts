import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFixture, TEST_URL, type Fixture } from "./harness";
import type { DbRunner } from "@/lib/db";
import type { ClientAccess, SessionUser } from "@/lib/auth/types";
import { OfflineDraftProvider } from "@/lib/ai/provider";
import { generateForOpportunity } from "@/lib/engine/generate";
import { approveComment, enqueuePublishing, Outbox, submitForApproval, WorkflowError } from "@/lib/engine/workflow";
import { processDueJobs } from "@/lib/engine/publisher";

const d = TEST_URL ? describe : describe.skip;
let f: Fixture;

const session = (id: string, role: SessionUser["platformRole"]): SessionUser => ({ id, organizationId: f.org, email: "", fullName: role, platformRole: role, sessionId: "t" });
async function access(userId: string, clientId: string): Promise<ClientAccess> {
  const r = (await f.asUser(userId, (db) =>
    db.one<{ gbs: boolean; role: "owner" | "member" | null; manage: boolean; edit: boolean; ac: boolean }>(
      `select app.is_gbs_manager($1) as gbs, app.client_role($1) as role, app.can_manage_client($1) as manage, app.can_edit_comments($1) as edit, app.can_approve_client($1) as ac`,
      [clientId],
    ),
  ))!;
  return { clientId, isGbsManager: r.gbs, clientRole: r.role, canManage: r.manage, canEditComments: r.edit, canApproveGbs: r.gbs, canApproveClient: r.ac };
}

d("engagement workflow end to end (database)", () => {
  beforeAll(async () => {
    f = await createFixture();
  }, 60_000);
  afterAll(async () => {
    await f?.close();
  });

  it("generates, checks, approves and routes a third-party Instagram comment to manual action", async () => {
    const amRun: DbRunner = (fn) => f.asUser(f.users.amA, fn);
    const gen = await generateForOpportunity(amRun, {
      clientId: f.A.id,
      opportunityId: f.A.opportunity,
      actor: { id: f.users.amA, name: "AM" },
      provider: new OfflineDraftProvider(),
    });
    expect(gen.commentIds).toHaveLength(3);
    const rows = await f.asSystem((db) =>
      db.query<{ comment_type: string; quality_report: { checks: unknown[] }; client_id: string }>("select comment_type, quality_report, client_id from comments where generation_id = $1", [gen.generationId]),
    );
    expect(rows.map((r) => r.comment_type).sort()).toEqual(["conversation", "expert", "insight"]);
    expect(rows.every((r) => r.client_id === f.A.id && r.quality_report.checks.length === 7)).toBe(true);

    const outbox = new Outbox();
    const am = session(f.users.amA, "account_manager");
    await f.asUser(f.users.amA, async (db) => submitForApproval(db, am, await access(f.users.amA, f.A.id), gen.selectedId, outbox));
    expect(outbox.notices[0]).toMatchObject({ kind: "approval_required", clientId: f.A.id });

    // Client A is in manual mode: the account manager cannot approve, the owner can.
    await expect(f.asUser(f.users.amA, async (db) => approveComment(db, am, await access(f.users.amA, f.A.id), gen.selectedId, outbox))).rejects.toBeInstanceOf(WorkflowError);
    const owner = session(f.users.ownerA, "client_user");
    const outcome = await f.asUser(f.users.ownerA, async (db) => approveComment(db, owner, await access(f.users.ownerA, f.A.id), gen.selectedId, outbox));
    expect(outcome).toBe("approved");

    await f.asUser(f.users.ownerA, async (db) => enqueuePublishing(db, owner, await access(f.users.ownerA, f.A.id), gen.selectedId));
    const system: DbRunner = (fn) => f.asSystem(fn);
    const job = await f.asSystem((db) => db.one<{ id: string }>("select id from publishing_jobs where comment_id = $1", [gen.selectedId]));
    const results = await processDueJobs(system, { clientId: f.A.id });
    const mine = results.find((r) => r.jobId === job!.id);
    expect(mine?.status).toBe("manual_required");
    const c = await f.asSystem((db) => db.one<{ status: string; published_at: Date | null }>("select status, published_at from comments where id = $1", [gen.selectedId]));
    expect(c).toMatchObject({ status: "queued", published_at: null });
  });

  it("a client owner cannot generate or approve for another client", async () => {
    const ownerB = session(f.users.ownerB, "client_user");
    await expect(
      generateForOpportunity((fn) => f.asUser(f.users.ownerB, fn), {
        clientId: f.A.id,
        opportunityId: f.A.opportunity,
        actor: { id: f.users.ownerB, name: "B" },
        provider: new OfflineDraftProvider(),
      }),
    ).rejects.toThrow();
    await expect(
      f.asUser(f.users.ownerB, async (db) => approveComment(db, ownerB, await access(f.users.ownerB, f.A.id), f.A.comment, new Outbox())),
    ).rejects.toThrow();
  });
});
