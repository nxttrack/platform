import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { recordPlatformServiceHeartbeat, type PlatformHeartbeatStatus } from "@/lib/domain/platform-health-heartbeats";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const allowedServices = new Set([
  "runtime_monitor",
  "storage_backup",
  "automation_recipes",
  "participant_media_expiry",
  "billing_collections",
  "next_best_actions",
  "clamav_scanner"
]);

export async function POST(request: Request) {
  if (!hasValidCronSecret(request)) return NextResponse.json({ accepted: false, reason: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const serviceKey = typeof body?.serviceKey === "string" ? body.serviceKey : "";
  const status = typeof body?.status === "string" && ["pass", "degraded", "fail"].includes(body.status)
    ? body.status as PlatformHeartbeatStatus
    : null;
  const detail = typeof body?.detail === "string" ? body.detail.trim().slice(0, 500) : "";
  const ttlMinutes = Number(body?.ttlMinutes);
  if (!allowedServices.has(serviceKey) || !status || detail.length < 3 || !Number.isFinite(ttlMinutes)) {
    return NextResponse.json({ accepted: false, reason: "invalid_payload" }, { status: 400 });
  }
  const accepted = await recordPlatformServiceHeartbeat({
    serviceKey,
    status,
    detail,
    ttlMinutes,
    metadata: body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
      ? body.metadata as Record<string, unknown>
      : {}
  });
  return NextResponse.json({ accepted }, { status: accepted ? 202 : 503 });
}

function hasValidCronSecret(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-cron-secret")?.trim();
  const actual = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : headerSecret ?? "";
  if (!expected || expected.length < 32 || !actual) return false;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}
