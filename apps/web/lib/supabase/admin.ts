import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requireSupabasePublicConfig } from "./config";

export function createAdminClient() {
  const config = requireSupabasePublicConfig();
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("Supabase admin client is not configured. Set SUPABASE_SECRET_KEY on the server.");
  }

  return createSupabaseClient(config.url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
