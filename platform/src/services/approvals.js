import { insert, update, findBy, find } from '../db/repo.js';
import { audit } from '../core/audit.js';
import { notify } from './notifications.js';
import { now } from '../core/ids.js';

/**
 * Approval Centre (§15, §30).
 *
 * Human approval is the default path for everything the AI produces. An
 * approval item is a pointer to a subject row plus the reviewer's decision; the
 * subject's own status is updated in step, so nothing can be "approved" in one
 * place and still pending in another.
 */

/** @typedef {'content'|'comment'|'auto_post'|'trending_post'|'engagement'} ApprovalKind */

/**
 * @param {{
 *  agencyId:string, clientId:string, kind:ApprovalKind,
 *  subjectType:string, subjectId:string, title:string, preview?:string,
 *  platform?:string, riskFlags?:string[], qualityScore?:number, assignedTo?:string|null,
 *  actor?: {type:'user'|'agent'|'system', id?:string, label?:string},
 * }} input
 */
export function enqueueApproval(input) {
  const existing = findBy('approval_items', input.agencyId, {
    subject_type: input.subjectType, subject_id: input.subjectId,
  });
  if (existing) return existing;

  const item = insert('approval_items', {
    agency_id: input.agencyId,
    client_id: input.clientId,
    kind: input.kind,
    subject_type: input.subjectType,
    subject_id: input.subjectId,
    platform: input.platform ?? null,
    title: input.title,
    preview: input.preview ?? null,
    risk_flags: input.riskFlags ?? [],
    quality_score: input.qualityScore ?? null,
    assigned_to: input.assignedTo ?? null,
    status: 'pending',
  });

  audit({
    agencyId: input.agencyId, clientId: input.clientId,
    actorType: input.actor?.type ?? 'agent', actorId: input.actor?.id,
    actorLabel: input.actor?.label ?? 'approval_queue',
    action: 'approval.enqueued',
    objectType: 'approval_items', objectId: item.id,
    platform: input.platform,
    next: { kind: input.kind, title: input.title, quality_score: input.qualityScore },
  });

  notify({
    agencyId: input.agencyId, clientId: input.clientId,
    kind: 'approval_required',
    severity: (input.riskFlags ?? []).length ? 'warning' : 'info',
    title: `Approval needed: ${input.title}`,
    body: input.preview?.slice(0, 280),
    link: `/approvals?item=${item.id}`,
  });

  return item;
}

/**
 * Record a decision and move the subject with it.
 * @param {{agencyId:string, itemId:string, decision:'approved'|'rejected'|'edited',
 *          userId:string, note?:string, ip?:string}} input
 */
export function decide(input) {
  const item = find('approval_items', input.agencyId, input.itemId);
  if (!item) return null;

  const updated = update('approval_items', input.agencyId, input.itemId, {
    status: input.decision,
    decided_by: input.userId,
    decided_at: now(),
    decision_note: input.note ?? null,
  });

  const subjectStatus = SUBJECT_STATUS[input.decision]?.[item.subject_type];
  if (subjectStatus) {
    update(item.subject_type, input.agencyId, item.subject_id, {
      status: subjectStatus,
      ...(item.subject_type === 'scheduled_content'
        ? {
            approval_status: input.decision === 'approved' ? 'approved' : 'rejected',
            approved_by: input.userId,
            approved_at: now(),
          }
        : {}),
    });
  }

  audit({
    agencyId: input.agencyId, clientId: item.client_id,
    actorType: 'user', actorId: input.userId,
    action: `approval.${input.decision}`,
    objectType: item.subject_type, objectId: item.subject_id,
    platform: item.platform,
    previous: { status: item.status },
    next: { status: input.decision, note: input.note },
    ip: input.ip,
  });

  return updated;
}

/** How each decision maps onto the subject row's own status column. */
const SUBJECT_STATUS = {
  approved: {
    scheduled_content: 'APPROVED',
    generated_comments: 'approved',
    content_ideas: 'approved',
  },
  rejected: {
    scheduled_content: 'DRAFT',
    generated_comments: 'rejected',
    content_ideas: 'rejected',
  },
  edited: {
    scheduled_content: 'IN_REVIEW',
    generated_comments: 'draft',
    content_ideas: 'in_review',
  },
};
