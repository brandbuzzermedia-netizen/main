import type { ClientAccess } from "@/lib/auth/types";

export type ApprovalMode = "manual" | "gbs" | "dual";
export type ApprovalSide = "gbs" | "client";

export const APPROVAL_MODE_LABELS: Record<ApprovalMode, { label: string; description: string }> = {
  manual: { label: "Manual (client approval)", description: "Every comment requires approval by the client." },
  gbs: { label: "GBS approval", description: "A GBS account manager approves comments." },
  dual: { label: "Dual approval", description: "GBS approval and client approval are both required." },
};

export function requiredSides(mode: ApprovalMode): ApprovalSide[] {
  return mode === "manual" ? ["client"] : mode === "gbs" ? ["gbs"] : ["gbs", "client"];
}

/** The side this user approves on for a given mode, or null if they cannot approve. */
export function approverSide(access: Pick<ClientAccess, "canApproveGbs" | "canApproveClient">, mode: ApprovalMode): ApprovalSide | null {
  const sides = requiredSides(mode);
  if (sides.includes("gbs") && access.canApproveGbs) return "gbs";
  if (sides.includes("client") && access.canApproveClient) return "client";
  return null;
}

export function isFullyApproved(mode: ApprovalMode, approvedSides: ApprovalSide[]): boolean {
  return requiredSides(mode).every((s) => approvedSides.includes(s));
}

/** Bulk approval is only offered for comments that passed every quality check. */
export function bulkApprovable(c: { status: string; quality_passed: boolean }): boolean {
  return c.status === "pending_approval" && c.quality_passed;
}
