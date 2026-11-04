import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFixture, errorCode, TEST_URL, type Fixture } from "./harness";

const d = TEST_URL ? describe : describe.skip;
let f: Fixture;

const approve = (user: string, clientId: string, comment: string, side: "gbs" | "client") =>
  f.asUser(user, (db) =>
    db.query(
      `insert into comment_approvals (organization_id, client_id, comment_id, approver_id, approver_side, decision) values ($1, $2, $3, $4, $5, 'approved')`,
      [f.org, clientId, comment, user, side],
    ),
  );
const setStatus = (user: string, comment: string, status: string) =>
  f.asUser(user, (db) => db.query("update comments set status = $2 where id = $1", [comment, status]));

d("approval workflow enforcement (database)", () => {
  beforeAll(async () => {
    f = await createFixture();
  }, 60_000);
  afterAll(async () => {
    await f?.close();
  });

  it("an unapproved comment cannot be approved, queued or published", async () => {
    expect(await errorCode(() => setStatus(f.users.amA, f.A.comment, "approved"))).toBe("42501");
    expect(await errorCode(() => setStatus(f.users.amA, f.A.comment, "published"))).toBe("42501");
    expect(
      await errorCode(() =>
        f.asSystem((db) =>
          db.query(`insert into publishing_jobs (organization_id, client_id, comment_id, platform) values ($1, $2, $3, 'instagram')`, [
            f.org,
            f.A.id,
            f.A.comment,
          ]),
        ),
      ),
    ).toBe("42501");
  });

  it("manual mode needs the client side; a GBS manager cannot stand in for the client", async () => {
    expect(await errorCode(() => approve(f.users.amA, f.A.id, f.A.comment, "client"))).toBe("42501");
    await approve(f.users.amA, f.A.id, f.A.comment, "gbs"); // allowed to record, but not sufficient
    expect(await errorCode(() => setStatus(f.users.amA, f.A.comment, "approved"))).toBe("42501");
  });

  it("team members without approval rights can't approve or reject", async () => {
    expect(await errorCode(() => approve(f.users.memberA, f.A.id, f.A.comment, "client"))).toBe("42501");
    // RLS gives the member no updatable rows, so the update silently matches nothing.
    await setStatus(f.users.memberA, f.A.comment, "rejected");
    const c = await f.asSystem((db) => db.one<{ status: string }>("select status from comments where id = $1", [f.A.comment]));
    expect(c!.status).toBe("pending_approval");
  });

  it("editing clears earlier approvals; approved text is frozen", async () => {
    await approve(f.users.ownerA, f.A.id, f.A.comment, "client");
    await f.asUser(f.users.ownerA, (db) => db.query("update comments set current_text = 'edited text here' where id = $1", [f.A.comment]));
    const left = await f.asSystem((db) => db.query("select id from comment_approvals where comment_id = $1 and decision = 'approved'", [f.A.comment]));
    expect(left).toHaveLength(0);
    const c = await f.asSystem((db) => db.one<{ is_edited: boolean }>("select is_edited from comments where id = $1", [f.A.comment]));
    expect(c!.is_edited).toBe(true);
    await approve(f.users.ownerA, f.A.id, f.A.comment, "client");
    await setStatus(f.users.ownerA, f.A.comment, "approved");
    expect(
      await errorCode(() => f.asUser(f.users.ownerA, (db) => db.query("update comments set current_text = 'sneaky' where id = $1", [f.A.comment]))),
    ).toBe("42501");
  });

  it("dual mode requires both sides", async () => {
    await f.asSystem((db) => db.query("update clients set approval_mode = 'dual' where id = $1", [f.B.id]));
    await approve(f.users.ownerB, f.B.id, f.B.comment, "client");
    expect(await errorCode(() => setStatus(f.users.ownerB, f.B.comment, "approved"))).toBe("42501");
    await approve(f.users.amB, f.B.id, f.B.comment, "gbs");
    await setStatus(f.users.amB, f.B.comment, "approved");
    const c = await f.asSystem((db) => db.one<{ approved_at: Date | null }>("select approved_at from comments where id = $1", [f.B.comment]));
    expect(c!.approved_at).not.toBeNull();
  });

  it("only GBS can change the approval mode", async () => {
    expect(
      await errorCode(() => f.asUser(f.users.ownerA, (db) => db.query("update clients set approval_mode = 'gbs' where id = $1", [f.A.id]))),
    ).toBe("42501");
    await f.asUser(f.users.amA, (db) => db.query("update clients set approval_mode = 'gbs' where id = $1", [f.A.id]));
  });

  it("only super admins create clients", async () => {
    expect(
      await errorCode(() =>
        f.asUser(f.users.amA, (db) => db.query("insert into clients (organization_id, name, slug) values ($1, 'X', 'x')", [f.org])),
      ),
    ).toBe("42501");
    await f.asUser(f.users.admin, (db) => db.query("insert into clients (organization_id, name, slug) values ($1, 'X', 'x')", [f.org]));
  });

  it("the audit log is append-only", async () => {
    expect(await errorCode(() => f.asSystem((db) => db.query("update audit_logs set action = 'x'")))).toBe("42501");
    expect(await errorCode(() => f.asSystem((db) => db.query("delete from audit_logs")))).toBe("42501");
    expect(await errorCode(() => f.asUser(f.users.admin, (db) => db.query("delete from audit_logs")))).toBe("42501");
  });
});
