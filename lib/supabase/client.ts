import { createBrowserClient } from "@supabase/ssr";

import { createJwtSkewRetryFetch } from "@/lib/jwt-retry";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // Token recem-renovado recusado por diferenca de relogio: repete (lib/jwt-retry).
    { global: { fetch: createJwtSkewRetryFetch() } }
  );
}
