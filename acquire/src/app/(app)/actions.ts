"use server";

import { redirect } from "next/navigation";
import { getContext, setActiveOrg } from "@/lib/auth";

export async function switchOrganization(formData: FormData) {
  const ctx = await getContext();
  const org = String(formData.get("org") ?? "");
  // Only switch to an organization the user belongs to; RLS would hide the rest anyway.
  if (ctx.organizations.some((o) => o.id === org)) await setActiveOrg(org);
  redirect("/");
}
