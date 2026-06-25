import { NextResponse } from "next/server";

import { getObservabilityRuntimeStatus } from "@/lib/observability/config";
import { getReleaseMetadata } from "@/lib/observability/release";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export function GET() {
  const supabaseAuthConfigured = Boolean(getSupabasePublicConfig());
  const release = getReleaseMetadata();

  return NextResponse.json({
    ok: true,
    status: "healthy",
    app: "nxttrack-platform",
    commit: release.commit,
    version: release.version,
    environment: release.environment,
    deploymentTarget: release.deploymentTarget,
    builtAt: release.builtAt,
    release,
    observability: getObservabilityRuntimeStatus(),
    checks: {
      supabaseAuthConfigured
    },
    supabaseAuthConfigured,
    timestamp: new Date().toISOString()
  });
}
