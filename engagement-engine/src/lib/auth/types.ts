export type PlatformRole = "super_admin" | "account_manager" | "client_user";

export interface SessionUser {
  id: string;
  organizationId: string;
  email: string;
  fullName: string;
  platformRole: PlatformRole;
  sessionId: string;
}

export interface ClientAccess {
  clientId: string;
  /** Super admin of the organisation or an account manager assigned to the client. */
  isGbsManager: boolean;
  clientRole: "owner" | "member" | null;
  canManage: boolean;
  canEditComments: boolean;
  canApproveGbs: boolean;
  canApproveClient: boolean;
}

export const isStaff = (u: Pick<SessionUser, "platformRole">) =>
  u.platformRole === "super_admin" || u.platformRole === "account_manager";

export const isSuperAdmin = (u: Pick<SessionUser, "platformRole">) => u.platformRole === "super_admin";
