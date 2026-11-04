import type { Db } from "@/lib/db";

export interface AuditEntry {
  organizationId: string;
  clientId?: string | null;
  campaignId?: string | null;
  actorId: string | null;
  actorName: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  ip?: string | null;
}

/** Appends to audit_logs. Works with a user transaction (RLS checks actor_id = current user) or the system connection. */
export async function audit(db: Db, e: AuditEntry): Promise<void> {
  await db.query(
    `insert into audit_logs (organization_id, client_id, campaign_id, actor_id, actor_name, action, entity_type, entity_id, details, ip)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      e.organizationId,
      e.clientId ?? null,
      e.campaignId ?? null,
      e.actorId,
      e.actorName,
      e.action,
      e.entityType,
      e.entityId ?? null,
      JSON.stringify(e.details ?? {}),
      e.ip ?? null,
    ],
  );
}

export const AUDIT_LABELS: Record<string, string> = {
  "client.created": "Created client",
  "client.updated": "Updated client",
  "client.archived": "Archived client",
  "client.restored": "Restored client",
  "client.deleted": "Deleted client",
  "account.connected": "Connected account",
  "account.disconnected": "Disconnected account",
  "brand.updated": "Updated brand profile",
  "document.uploaded": "Uploaded brand document",
  "document.deleted": "Deleted brand document",
  "segment.created": "Created audience segment",
  "segment.updated": "Updated audience segment",
  "segment.deleted": "Deleted audience segment",
  "campaign.created": "Created campaign",
  "campaign.updated": "Changed campaign settings",
  "campaign.paused": "Paused campaign",
  "campaign.activated": "Activated campaign",
  "discovery.run": "Ran discovery",
  "opportunity.added": "Added opportunity manually",
  "opportunity.dismissed": "Dismissed opportunity",
  "comment.generated": "Generated comments",
  "comment.edited": "Edited comment",
  "comment.suggested": "Suggested an edit",
  "comment.submitted": "Submitted for approval",
  "comment.approved": "Approved comment",
  "comment.rejected": "Rejected comment",
  "comment.published": "Published comment",
  "comment.published_manually": "Recorded manual publication",
  "comment.publish_failed": "Publishing failed",
  "publishing.queued": "Queued for publishing",
  "publishing.cancelled": "Cancelled publishing",
  "publishing.retried": "Retried publishing",
  "user.created": "Created user",
  "user.updated": "Updated user",
  "settings.updated": "Updated settings",
  "limits.updated": "Updated limits",
};
