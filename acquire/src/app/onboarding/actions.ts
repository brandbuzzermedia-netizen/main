"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getUser, setActiveOrg } from "@/lib/auth";
import { isDevelopment } from "@/lib/env";
import { seedDemoWorkspace } from "@/lib/demo";
import { isValidTimeZone } from "@/domain/eligibility";

export type OnboardingState = { error?: string };

const schema = z.object({
  name: z.string().trim().min(2, "Enter your business name").max(120),
  market: z.enum(["US", "GB", "AE", "CA", "AU"], "Choose a market"),
  timezone: z.preprocess((v) => (v === "" ? undefined : v), z.string().refine(isValidTimeZone, "Unknown time zone").optional()),
});

export async function createOrganization(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const { supabase } = await getUser();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { data, error } = await supabase.rpc("create_organization", {
    p_name: parsed.data.name,
    p_market: parsed.data.market,
    p_timezone: parsed.data.timezone ?? null,
  });
  if (error) return { error: error.message };
  await setActiveOrg(data as string);
  redirect("/");
}

export async function createDemoWorkspace(): Promise<OnboardingState> {
  if (!isDevelopment) return { error: "Demo data can only be created in development." };
  const { supabase } = await getUser();
  const { data, error } = await supabase.rpc("create_organization", { p_name: "[DEMO] Harbor Realty", p_market: "US", p_timezone: "America/Chicago", p_is_demo: true });
  if (error) return { error: error.message };
  const seeded = await seedDemoWorkspace(supabase, data as string);
  if (seeded.error) return { error: seeded.error };
  await setActiveOrg(data as string);
  redirect("/");
}
