import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Uses the service_role key, which bypasses Row Level Security entirely.
// Never import this outside of Server Actions / Route Handlers, and never
// expose SUPABASE_SERVICE_ROLE_KEY via a NEXT_PUBLIC_ variable.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
