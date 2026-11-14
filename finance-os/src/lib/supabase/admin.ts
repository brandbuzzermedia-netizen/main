import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabasePublicEnv, supabaseServiceRoleKey } from "@/lib/env";

/**
 * Service-role client: BYPASSES RLS. Only for signed job/webhook route handlers, plus one
 * narrow check on the login page (`invitation_open`, a yes/no answer that is never shown).
 * Never use it to read or write data on a user's behalf.
 */
export function createAdminClient() {
  const { url } = supabasePublicEnv();
  return createClient(url, supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
