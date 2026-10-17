"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWriter } from "@/lib/auth";

const schema = z.object({
  status: z.enum(["resolved", "dismissed", "in_progress"]),
  resolution: z.string().trim().max(2000).optional(),
});

export async function updateTaskAction(taskId: string, formData: FormData) {
  const ctx = await requireWriter();
  const parsed = schema.parse({ status: formData.get("status"), resolution: formData.get("resolution") || undefined });
  const closing = parsed.status !== "in_progress";
  const { error } = await ctx.supabase
    .from("escalation_tasks")
    .update({
      status: parsed.status,
      resolution: parsed.resolution ?? null,
      resolved_by: closing ? ctx.userId : null,
      resolved_at: closing ? new Date().toISOString() : null,
    })
    .eq("id", taskId)
    .eq("organization_id", ctx.org.id);
  if (error) throw new Error(error.message);
  revalidatePath("/tasks");
}
