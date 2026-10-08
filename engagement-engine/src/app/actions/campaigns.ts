"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { systemRunner, userRunner } from "@/lib/db";
import { runDiscovery } from "@/lib/engine/discovery";
import { requireClientAccess } from "@/lib/auth/session";
import { ForbiddenError, inClient, optStr, parseList, rateLimit, str } from "@/lib/server-action";

const PLATFORM = z.enum(["instagram", "facebook", "linkedin", "youtube"]);

export async function saveCampaign(clientId: string, campaignId: string | null, _p: ActionResult, fd: FormData): Promise<ActionResult> {
  let id = campaignId;
  try {
    const v = {
      name: z.string().min(2).max(120).parse(str(fd.get("name"), 120)),
      objective: optStr(fd.get("objective"), 500),
      platforms: z.array(PLATFORM).min(1, "Choose at least one platform").parse(fd.getAll("platforms")),
      keywords: parseList(fd.get("keywords")),
      hashtags: parseList(fd.get("hashtags")).map((h) => h.replace(/^#/, "")),
      locations: parseList(fd.get("locations")),
      daily_opportunity_limit: z.coerce.number().int().min(0).max(500).parse(fd.get("daily_opportunity_limit")),
      daily_publish_limit: z.coerce.number().int().min(0).max(100).parse(fd.get("daily_publish_limit")),
      min_score: z.coerce.number().int().min(0).max(100).parse(fd.get("min_score")),
      approval_mode: z.enum(["", "manual", "gbs", "dual"]).parse(fd.get("approval_mode") ?? "") || null,
    };
    const segmentIds = z.array(z.string().uuid()).parse(fd.getAll("segments"));
    const targetIds = z.array(z.string().uuid()).parse(fd.getAll("targets"));
    await inClient(clientId, async ({ db, user, access }) => {
      if (!access.canManage) throw new ForbiddenError("Only GBS and the client owner can edit campaigns.");
      if (v.approval_mode && !access.isGbsManager) throw new ForbiddenError("Only GBS can override the approval mode.");
      if (id) {
        const r = await db.query(
          `update campaigns set name = $3, objective = $4, platforms = $5, keywords = $6, hashtags = $7, locations = $8,
             daily_opportunity_limit = $9, daily_publish_limit = $10, min_score = $11, approval_mode = $12, updated_at = now()
           where id = $1 and client_id = $2 returning id`,
          [id, clientId, ...Object.values(v)],
        );
        if (!r.length) throw new ForbiddenError("Campaign not found.");
        await db.query("delete from campaign_segments where campaign_id = $1 and client_id = $2", [id, clientId]);
        await db.query("delete from campaign_target_profiles where campaign_id = $1 and client_id = $2", [id, clientId]);
      } else {
        id = (await db.one<{ id: string }>(
          `insert into campaigns (organization_id, client_id, name, objective, platforms, keywords, hashtags, locations,
             daily_opportunity_limit, daily_publish_limit, min_score, approval_mode, created_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id`,
          [user.organizationId, clientId, ...Object.values(v), user.id],
        ))!.id;
      }
      // Composite foreign keys reject any segment/profile that isn't this client's.
      for (const s of segmentIds) {
        await db.query(`insert into campaign_segments (organization_id, client_id, campaign_id, segment_id) values ($1, $2, $3, $4)`, [user.organizationId, clientId, id, s]);
      }
      for (const t of targetIds) {
        await db.query(`insert into campaign_target_profiles (organization_id, client_id, campaign_id, target_profile_id) values ($1, $2, $3, $4)`, [
          user.organizationId,
          clientId,
          id,
          t,
        ]);
      }
      await audit(db, {
        organizationId: user.organizationId,
        clientId,
        campaignId: id,
        actorId: user.id,
        actorName: user.fullName,
        action: campaignId ? "campaign.updated" : "campaign.created",
        entityType: "campaign",
        entityId: id,
        details: { ...v, segments: segmentIds.length },
      });
    });
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath(`/clients/${clientId}/campaigns`);
  redirect(`/clients/${clientId}/campaigns/${id}`);
}

export async function setCampaignStatus(clientId: string, campaignId: string, status: "active" | "paused" | "archived"): Promise<ActionResult> {
  try {
    await inClient(clientId, async ({ db, user, access }) => {
      if (!access.canManage) throw new ForbiddenError();
      if (status === "active") {
        const client = await db.one<{ status: string }>("select status from clients where id = $1", [clientId]);
        if (client?.status !== "active") throw new ForbiddenError("Activate the client before activating campaigns.");
      }
      await db.query("update campaigns set status = $3, updated_at = now() where id = $1 and client_id = $2", [campaignId, clientId, status]);
      await audit(db, {
        organizationId: user.organizationId,
        clientId,
        campaignId,
        actorId: user.id,
        actorName: user.fullName,
        action: status === "active" ? "campaign.activated" : status === "paused" ? "campaign.paused" : "campaign.updated",
        entityType: "campaign",
        entityId: campaignId,
        details: { status },
      });
    });
    revalidatePath(`/clients/${clientId}/campaigns`, "layout");
    return { ok: true, message: `Campaign ${status}.` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function runDiscoveryNow(clientId: string, campaignId: string): Promise<ActionResult> {
  try {
    const { user, access } = await requireClientAccess(clientId);
    if (!access.canManage) throw new ForbiddenError();
    await rateLimit(`discovery:${user.id}`, 10, 3600);
    const r = await runDiscovery(userRunner(user.id), systemRunner, { clientId, campaignId, actor: { id: user.id, name: user.fullName } });
    revalidatePath(`/clients/${clientId}`, "layout");
    const parts = [`${r.created} new opportunit${r.created === 1 ? "y" : "ies"} from ${r.examined} items checked.`];
    if (r.errors.length) parts.push(r.errors.join(" "));
    return { ok: r.errors.length === 0 || r.created > 0, message: parts.join(" ") };
  } catch (e) {
    return toActionError(e);
  }
}
