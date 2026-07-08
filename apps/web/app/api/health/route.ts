import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

type HealthCheckStatus = "pass" | "fail" | "skipped";

type DatabaseHealthCheck = {
  configured: boolean;
  latencyMs?: number;
  message: string;
  status: HealthCheckStatus;
};

const APP_NAME = "nxttrack-platform";

export async function GET() {
  const database = await checkDatabase();
  const requireDatabase = process.env.REQUIRE_HEALTH_DATABASE === "true" || process.env.HEALTH_STRICT === "true";
  const ok = database.status !== "fail" && (!requireDatabase || database.status === "pass");

  return NextResponse.json(
    {
      ok,
      app: APP_NAME,
      env: process.env.APP_ENV ?? "development",
      commitSha: process.env.RELEASE_COMMIT_SHA ?? process.env.GITHUB_SHA ?? null,
      buildTimestamp: process.env.RELEASE_BUILD_TIME ?? process.env.BUILD_TIMESTAMP ?? null,
      checkedAt: new Date().toISOString(),
      checks: {
        database
      }
    },
    { status: ok ? 200 : 503 }
  );
}

async function checkDatabase(): Promise<DatabaseHealthCheck> {
  const mode = process.env.HEALTH_CHECK_DATABASE ?? "auto";

  if (mode === "false") {
    return {
      configured: false,
      message: "Database health check is disabled by HEALTH_CHECK_DATABASE=false.",
      status: "skipped"
    };
  }

  const hasPublicConfig = Boolean(getSupabasePublicConfig());
  const hasServerSecret = Boolean(process.env.SUPABASE_SECRET_KEY);
  const configured = hasPublicConfig && hasServerSecret;

  if (!configured) {
    return {
      configured: false,
      message: mode === "true" ? "Supabase database health check is required but not configured." : "Supabase database health check is not configured.",
      status: mode === "true" ? "fail" : "skipped"
    };
  }

  const startedAt = Date.now();

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("tenants").select("id", { count: "exact", head: true }).limit(1);

    if (error) {
      return {
        configured: true,
        latencyMs: Date.now() - startedAt,
        message: `Supabase tenants probe failed: ${error.message}`,
        status: "fail"
      };
    }

    return {
      configured: true,
      latencyMs: Date.now() - startedAt,
      message: "Supabase tenants probe succeeded.",
      status: "pass"
    };
  } catch (error) {
    return {
      configured: true,
      latencyMs: Date.now() - startedAt,
      message: `Supabase database health check threw: ${error instanceof Error ? error.message : String(error)}`,
      status: "fail"
    };
  }
}
