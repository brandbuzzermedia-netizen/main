import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { isPermissionError } from "@/lib/db";
import { RateLimitError } from "@/lib/security/rate-limit";

export type ActionResult = { ok: boolean; message?: string; data?: Record<string, unknown> } | null;

const USER_FACING = new Set(["WorkflowError", "UsageLimitError", "ContextIsolationError", "AiRefusalError", "RateLimitError", "Error", "ManualActionRequired", "UnsupportedCapabilityError", "CredentialsUnavailableError", "PlatformApiError", "ForbiddenError"]);

/** Turns an exception into a message safe to show. Database errors never leak their details. */
export function toActionError(err: unknown): ActionResult {
  unstable_rethrow(err); // let Next.js redirects / notFound through
  if (err instanceof z.ZodError) {
    return { ok: false, message: err.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") };
  }
  if (err instanceof RateLimitError) return { ok: false, message: err.message };
  if (isPermissionError(err)) return { ok: false, message: "You don't have permission to do that for this client." };
  const isDbError = typeof (err as { code?: unknown })?.code === "string" && "severity" in (err as object);
  if (err instanceof Error && !isDbError && USER_FACING.has(err.constructor.name)) {
    return { ok: false, message: err.message };
  }
  if (isDbError && (err as { code: string }).code === "23505") return { ok: false, message: "That already exists." };
  console.error(err);
  return { ok: false, message: "Something went wrong. The error has been logged." };
}
