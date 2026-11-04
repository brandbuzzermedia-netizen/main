"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { ForbiddenError, inClient, optStr, parseList, str } from "@/lib/server-action";

export async function saveSegment(clientId: string, segmentId: string | null, _p: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const name = z.string().min(2).max(120).parse(str(fd.get("name"), 120));
    const fields = {
      description: optStr(fd.get("description"), 1000),
      industries: parseList(fd.get("industries")),
      job_titles: parseList(fd.get("job_titles")),
      locations: parseList(fd.get("locations")),
      interests: parseList(fd.get("interests")),
    };
    const kw = {
      keyword: parseList(fd.get("keywords")),
      hashtag: parseList(fd.get("hashtags")).map((h) => h.replace(/^#/, "")),
      negative: parseList(fd.get("negative_keywords")),
    };
    await inClient(clientId, async ({ db, user, access }) => {
      if (!access.canManage) throw new ForbiddenError("Only GBS and the client owner can edit audiences.");
      let id = segmentId;
      if (id) {
        const r = await db.query(
          `update audience_segments set name = $3, description = $4, industries = $5, job_titles = $6, locations = $7, interests = $8, updated_at = now()
           where id = $1 and client_id = $2 returning id`,
          [id, clientId, name, fields.description, fields.industries, fields.job_titles, fields.locations, fields.interests],
        );
        if (!r.length) throw new ForbiddenError("Segment not found.");
        await db.query("delete from audience_keywords where segment_id = $1 and client_id = $2", [id, clientId]);
      } else {
        id = (await db.one<{ id: string }>(
          `insert into audience_segments (organization_id, client_id, name, description, industries, job_titles, locations, interests)
           values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
          [user.organizationId, clientId, name, fields.description, fields.industries, fields.job_titles, fields.locations, fields.interests],
        ))!.id;
      }
      for (const [kind, words] of Object.entries(kw)) {
        for (const w of words) {
          await db.query(
            `insert into audience_keywords (organization_id, client_id, segment_id, keyword, kind) values ($1, $2, $3, $4, $5) on conflict do nothing`,
            [user.organizationId, clientId, id, w, kind],
          );
        }
      }
      await audit(db, {
        organizationId: user.organizationId,
        clientId,
        actorId: user.id,
        actorName: user.fullName,
        action: segmentId ? "segment.updated" : "segment.created",
        entityType: "audience_segment",
        entityId: id,
        details: { name },
      });
    });
    revalidatePath(`/clients/${clientId}/audiences`);
    return { ok: true, message: segmentId ? "Segment updated." : `Segment "${name}" created.` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteSegment(clientId: string, segmentId: string): Promise<ActionResult> {
  try {
    await inClient(clientId, async ({ db, user, access }) => {
      if (!access.canManage) throw new ForbiddenError();
      await db.query("delete from audience_segments where id = $1 and client_id = $2", [z.string().uuid().parse(segmentId), clientId]);
      await audit(db, { organizationId: user.organizationId, clientId, actorId: user.id, actorName: user.fullName, action: "segment.deleted", entityType: "audience_segment", entityId: segmentId });
    });
    revalidatePath(`/clients/${clientId}/audiences`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function addTargetProfile(clientId: string, _p: ActionResult, fd: FormData): Promise<ActionResult> {
  try {
    const platform = z.enum(["instagram", "facebook", "linkedin", "youtube"]).parse(fd.get("platform"));
    const handle = z
      .string()
      .min(1)
      .max(120)
      .parse(str(fd.get("handle"), 120).replace(/^@/, ""));
    const segmentId = optStr(fd.get("segment_id"), 40);
    await inClient(clientId, async ({ db, user, access }) => {
      if (!access.canManage) throw new ForbiddenError();
      await db.query(
        `insert into target_profiles (organization_id, client_id, segment_id, platform, handle, display_name, profile_url, notes, priority)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          user.organizationId,
          clientId,
          segmentId ? z.string().uuid().parse(segmentId) : null,
          platform,
          handle,
          optStr(fd.get("display_name"), 120),
          optStr(fd.get("profile_url"), 300),
          optStr(fd.get("notes"), 500),
          z.coerce.number().int().min(1).max(3).parse(fd.get("priority") ?? 2),
        ],
      );
    });
    revalidatePath(`/clients/${clientId}/audiences`);
    return { ok: true, message: `Added @${handle}.` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteTargetProfile(clientId: string, id: string): Promise<ActionResult> {
  try {
    await inClient(clientId, async ({ db, access }) => {
      if (!access.canManage) throw new ForbiddenError();
      await db.query("delete from target_profiles where id = $1 and client_id = $2", [z.string().uuid().parse(id), clientId]);
    });
    revalidatePath(`/clients/${clientId}/audiences`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
