import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabasePublicEnv, supabaseServiceRoleKey } from "@/lib/env";

/**
 * Service-role client: BYPASSES RLS. Only for signed job/webhook route handlers
 * (Phase 5+). Never use it to serve a user request.
 */
export function createAdminClient() {
  const { url } = supabasePublicEnv();
  return createClient(url, supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
