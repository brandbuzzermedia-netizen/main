import { Badge } from "./ui";
import type { VerificationStatus } from "@/lib/db-types";

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  if (status === "verified") return <Badge tone="ok">Verified</Badge>;
  if (status === "rejected") return <Badge tone="danger">Rejected</Badge>;
  return <Badge tone="warn">Awaiting verification</Badge>;
}

export const METHOD_LABEL: Record<string, string> = {
  upi: "UPI", neft: "NEFT", rtgs: "RTGS", imps: "IMPS", cheque: "Cheque", card: "Card", cash: "Cash", gateway: "Gateway", other: "Other",
};

export const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual entry", bank_import: "Bank statement", gateway: "Payment gateway", swipe: "Swipe",
};
