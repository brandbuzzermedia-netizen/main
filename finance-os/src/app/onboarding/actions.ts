"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getUser, setActiveOrg } from "@/lib/auth";
import { isDevelopment } from "@/lib/env";
import { seedDemoWorkspace } from "@/lib/demo";

export type OnboardingState = { error?: string };

export async function createOrganization(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const { supabase } = await getUser();
  const name = z.string().trim().min(2, "Enter your agency's name").max(120).safeParse(formData.get("name"));
  if (!name.success) return { error: name.error.issues[0].message };
  const { data, error } = await supabase.rpc("create_organization", { p_name: name.data });
  if (error) return { error: error.message };
  await setActiveOrg(data as string);
  redirect("/");
}

export async function createDemoWorkspace(): Promise<OnboardingState> {
  if (!isDevelopment) return { error: "Demo data can only be created in development." };
  const { supabase } = await getUser();
  const { data, error } = await supabase.rpc("create_organization", { p_name: "[DEMO] Get Bee Seen", p_is_demo: true });
  if (error) return { error: error.message };
  await seedDemoWorkspace(supabase, data as string);
  await setActiveOrg(data as string);
  redirect("/");
}
