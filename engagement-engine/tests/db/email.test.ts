import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFixture, TEST_URL, type Fixture } from "./harness";
import type { DbRunner } from "@/lib/db";
import type { OutgoingEmail } from "@/lib/email";
import { notifyClient } from "@/lib/engine/notify";
import { processEmailOutbox } from "@/lib/engine/email-outbox";

const d = TEST_URL ? describe : describe.skip;
let f: Fixture;

d("email outbox (database)", () => {
  beforeAll(async () => {
    f = await createFixture();
  }, 60_000);
  afterAll(async () => {
    await f?.close();
  });

  it("emails each notification once, only to its recipients, and honours opt-outs", async () => {
    const system: DbRunner = (fn) => f.asSystem(fn);
    await f.asSystem((db) => db.query("update notifications set email_status = 'skipped'")); // fixture rows
    await f.asSystem((db) => db.query("update users set email_notifications = false where id = $1", [f.users.amA]));
    await f.asSystem((db) =>
      notifyClient(db, { organizationId: f.org, clientId: f.A.id, kind: "approval_required", title: "Alpha: a comment needs <approval>", body: "Check it", link: `/clients/${f.A.id}/approvals`, audience: ["managers", "client_approvers"] }),
    );
    await f.asSystem((db) => notifyClient(db, { organizationId: f.org, clientId: f.A.id, kind: "comment_published", title: "in-app only", audience: ["client_owners"] }));

    const sent: OutgoingEmail[] = [];
    const r = await processEmailOutbox(system, async (m) => void sent.push(m), { appUrl: "https://engage.test", from: "GBS <engage@gbs.test>" });
    expect(r).toEqual({ sent: 1, skipped: 2, failed: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("owner@a.test");
    expect(sent[0].html).toContain("&lt;approval&gt;");
    expect(sent[0].html).toContain(`https://engage.test/clients/${f.A.id}/approvals`);
    expect(sent[0].html).not.toContain("Bravo");

    const again = await processEmailOutbox(system, async (m) => void sent.push(m), { from: "x@y.z" });
    expect(again).toEqual({ sent: 0, skipped: 0, failed: 0 });
  });

  it("marks failures without retrying forever", async () => {
    const system: DbRunner = (fn) => f.asSystem(fn);
    await f.asSystem((db) => notifyClient(db, { organizationId: f.org, clientId: f.B.id, kind: "publishing_failed", title: "Bravo: failed", audience: ["client_owners"] }));
    const r = await processEmailOutbox(system, async () => {
      throw new Error("provider down");
    }, { from: "x@y.z" });
    expect(r.failed).toBe(1);
  });
});
