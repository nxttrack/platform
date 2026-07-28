import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type PlatformHeartbeatStatus = "pass" | "degraded" | "fail";

export async function recordPlatformServiceHeartbeat(input: {
  serviceKey: string;
  status: PlatformHeartbeatStatus;
  detail: string;
  ttlMinutes: number;
  metadata?: Record<string, unknown>;
}) {
  const checkedAt = new Date();
  const environment = normalizeEnvironment(process.env.APP_ENV ?? process.env.NODE_ENV);
  const result = await createAdminClient().from("platform_service_heartbeats").upsert({
    service_key: input.serviceKey,
    environment,
    status: input.status,
    detail: input.detail.slice(0, 500),
    metadata_json: input.metadata ?? {},
    commit_sha: process.env.GITHUB_SHA?.slice(0, 64) ?? null,
    checked_at: checkedAt.toISOString(),
    expires_at: new Date(checkedAt.getTime() + Math.max(5, Math.min(10_080, input.ttlMinutes)) * 60_000).toISOString()
  }, { onConflict: "environment,service_key" });
  if (result.error) {
    console.error(`[platform-health] Could not record ${input.serviceKey}: ${result.error.message}`);
    return false;
  }
  return true;
}

function normalizeEnvironment(value: string | undefined): "development" | "staging" | "production" {
  const normalized = String(value ?? "").toLowerCase();
  return normalized === "production" ? "production" : normalized === "staging" ? "staging" : "development";
}
