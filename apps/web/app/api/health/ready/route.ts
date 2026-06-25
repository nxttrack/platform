import { NextResponse } from "next/server";

import { getObservabilityRuntimeStatus } from "@/lib/observability/config";
import { getReleaseMetadata } from "@/lib/observability/release";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export function GET() {
  const supabaseAuthConfigured = Boolean(getSupabasePublicConfig());
  const databaseConfigured = Boolean(process.env.DATABASE_URL);
  const emailConfigured = Boolean(
    process.env.SENDGRID_API_KEY ||
      (process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_FROM_EMAIL)
  );
  const release = getReleaseMetadata();
  const observability = getObservabilityRuntimeStatus();
  const ready = supabaseAuthConfigured && databaseConfigured;

  return NextResponse.json(
    {
      ok: ready,
      status: ready ? "ready" : "degraded",
      app: "nxttrack-platform",
      commit: release.commit,
      version: release.version,
      environment: release.environment,
      deploymentTarget: release.deploymentTarget,
      builtAt: release.builtAt,
      release,
      observability,
      checks: {
        databaseConfigured,
        emailConfigured,
        errorReportingConfigured: observability.errorReporting.configured,
        logSinkConfigured: observability.logSink.configured,
        supabaseAuthConfigured
      },
      timestamp: new Date().toISOString()
    },
    { status: ready ? 200 : 503 }
  );
}
