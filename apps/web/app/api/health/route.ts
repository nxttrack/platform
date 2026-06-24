import { NextResponse } from "next/server";

import { getSupabasePublicConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export function GET() {
  const supabaseAuthConfigured = Boolean(getSupabasePublicConfig());

  return NextResponse.json({
    ok: true,
    app: "nxttrack-platform",
    env: process.env.APP_ENV ?? "development",
    commit: process.env.COMMIT_SHA ?? null,
    supabaseAuthConfigured
  });
}
