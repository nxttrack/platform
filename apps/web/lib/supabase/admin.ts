import "server-only";

import { createClient } from "@supabase/supabase-js";

import { requireSupabasePublicConfig } from "./config";

export function createAdminClient() {
  const config = requireSupabasePublicConfig();
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secretKey) {
    throw new Error("Supabase admin key is not configured. Set SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(config.url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
