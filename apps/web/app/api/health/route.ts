import { NextResponse } from "next/server";

import { getReleaseMetadata } from "@/lib/observability/release";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export function GET() {
  const supabaseAuthConfigured = Boolean(getSupabasePublicConfig());

  return NextResponse.json({
    ok: true,
    status: "healthy",
    app: "nxttrack-platform",
    release: getReleaseMetadata(),
    checks: {
      supabaseAuthConfigured
    },
    supabaseAuthConfigured,
    timestamp: new Date().toISOString()
  });
}
