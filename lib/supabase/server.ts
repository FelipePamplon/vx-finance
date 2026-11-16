import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { createJwtSkewRetryFetch } from "@/lib/jwt-retry";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Token recem-renovado recusado por diferenca de relogio: repete (lib/jwt-retry).
      global: { fetch: createJwtSkewRetryFetch() },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Chamado a partir de um Server Component: o middleware
            // já cuida do refresh de sessão nesse caso.
          }
        },
      },
    }
  );
}
