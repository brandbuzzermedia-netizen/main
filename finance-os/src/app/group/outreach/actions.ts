"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getGroupContext } from "@/lib/workspace";

const back = (note: string) => redirect(`/group/outreach?note=${encodeURIComponent(note)}`);

/** Pause, resume, approve or withdraw approval for one campaign in any company. Each company's own rules decide who may. */
export async function groupCampaignAction(fd: FormData) {
  const g = await getGroupContext();
  const id = z.uuid().parse(fd.get("sequence_id"));
  const op = z.enum(["pause", "resume", "approve", "withdraw"]).parse(fd.get("op"));
  let msg: string;
  if (op === "approve" || op === "withdraw") {
    const { error } = await g.supabase.rpc("approve_campaign", { p_sequence: id, p_approve: op === "approve" });
    msg = error ? error.message : op === "approve" ? "Approved: it now sends every day on its own." : "Approval withdrawn.";
  } else {
    const { count, error } = await g.supabase.from("outreach_sequences").update({ status: op === "pause" ? "paused" : "active" }, { count: "exact" }).eq("id", id);
    msg = error || !count ? "Only a sales manager or owner of that company can start or pause its campaigns." : op === "pause" ? "Campaign paused." : "Campaign running.";
  }
  revalidatePath("/group/outreach");
  back(msg);
}

/** Launch one proven campaign in many companies: copies arrive paused and unapproved, ready to review and start. */
export async function groupCopyAction(fd: FormData) {
  const g = await getGroupContext();
  const seq = z.uuid().parse(fd.get("sequence_id"));
  const orgs = fd.getAll("org").map(String).filter((x) => z.uuid().safeParse(x).success);
  if (!orgs.length) back("Tick at least one company to copy the campaign to.");
  const { data, error } = await g.supabase.rpc("copy_campaign", { p_sequence: seq, p_orgs: orgs });
  revalidatePath("/group/outreach");
  back(error ? error.message : `Copied to ${data ?? 0} compan${data === 1 ? "y" : "ies"}. The copies are paused: approve and start them below.`);
}

/** Every campaign in every company: pause or resume at once (group owner). */
export async function groupPauseAllAction(fd: FormData) {
  const g = await getGroupContext();
  const paused = fd.get("paused") === "true";
  const { data, error } = await g.supabase.rpc("set_outreach_paused", { p_org: null, p_group: g.group.id, p_paused: paused });
  revalidatePath("/group/outreach");
  back(error ? error.message : `${data ?? 0} campaign(s) ${paused ? "paused" : "resumed"} across all companies.`);
}
