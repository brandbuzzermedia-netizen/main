import { describe, expect, it } from "vitest";
import { approverSide, bulkApprovable, isFullyApproved, requiredSides } from "@/lib/engine/approvals";

const gbs = { canApproveGbs: true, canApproveClient: false };
const owner = { canApproveGbs: false, canApproveClient: true };
const member = { canApproveGbs: false, canApproveClient: false };

describe("approval rules", () => {
  it("maps modes to required sides", () => {
    expect(requiredSides("manual")).toEqual(["client"]);
    expect(requiredSides("gbs")).toEqual(["gbs"]);
    expect(requiredSides("dual")).toEqual(["gbs", "client"]);
  });

  it("assigns each user the side they may approve on", () => {
    expect(approverSide(gbs, "manual")).toBeNull();
    expect(approverSide(owner, "manual")).toBe("client");
    expect(approverSide(gbs, "gbs")).toBe("gbs");
    expect(approverSide(owner, "gbs")).toBeNull();
    expect(approverSide(gbs, "dual")).toBe("gbs");
    expect(approverSide(owner, "dual")).toBe("client");
    expect(approverSide(member, "dual")).toBeNull();
  });

  it("requires every side before a comment counts as approved", () => {
    expect(isFullyApproved("dual", ["gbs"])).toBe(false);
    expect(isFullyApproved("dual", ["gbs", "client"])).toBe(true);
    expect(isFullyApproved("manual", ["gbs"])).toBe(false);
  });

  it("only offers bulk approval for comments that passed quality checks", () => {
    expect(bulkApprovable({ status: "pending_approval", quality_passed: true })).toBe(true);
    expect(bulkApprovable({ status: "pending_approval", quality_passed: false })).toBe(false);
    expect(bulkApprovable({ status: "generated", quality_passed: true })).toBe(false);
  });
});
