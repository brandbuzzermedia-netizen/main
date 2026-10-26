import type { Role } from "@/domain/labels";

/**
 * What each role may do in the UI. The database enforces the same rules through RLS
 * (supabase/migrations/*_rls_and_functions.sql); these flags only decide what to show.
 */
export function permissionsFor(role: Role) {
  const manager = role === "agency_admin" || role === "campaign_manager";
  return {
    /** Create leads (reps: only assigned to themselves). */
    createLeads: role !== "read_only",
    importLeads: manager,
    exportLeads: manager,
    assignLeads: manager,
    configurePipeline: manager,
    manageTeam: role === "agency_admin",
    manageSettings: role === "agency_admin",
    eraseLeads: role === "agency_admin",
    liftSuppression: role === "agency_admin",
    viewAudit: role === "agency_admin",
    viewBilling: role === "agency_admin",
  };
}

export type Permissions = ReturnType<typeof permissionsFor>;
