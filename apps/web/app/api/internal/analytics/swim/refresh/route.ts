import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { runSwimAnalyticsProjectionCycle } from "@/lib/domain/capacity-forecast-snapshots";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasValidCronSecret(request)) {
    return NextResponse.json({ accepted: false, reason: "unauthorized" }, { status: 401 });
  }
  if (process.env.INTERNAL_JOBS_ENABLED !== "true") {
    return NextResponse.json({ accepted: false, reason: "release_gate_disabled" }, { status: 423 });
  }
  const body = await request.json().catch(() => ({})) as { tenantId?: unknown };
  const tenantId = typeof body.tenantId === "string" && isUuid(body.tenantId)
    ? body.tenantId
    : null;
  if (body.tenantId !== undefined && !tenantId) {
    return NextResponse.json({ accepted: false, reason: "invalid_tenant" }, { status: 400 });
  }

  const admin = createAdminClient();
  let query = admin.from("tenants").select("id").eq("status", "active").order("id");
  if (tenantId) query = query.eq("id", tenantId);
  const tenants = await query;
  if (tenants.error) {
    return NextResponse.json({ accepted: false, reason: "tenant_lookup" }, { status: 503 });
  }
  const results: Array<{
    tenantId: string;
    status: "generated" | "failed";
    reconciledEvents?: number;
    error?: string;
  }> = [];
  for (const tenant of tenants.data ?? []) {
    try {
      const generated = await runSwimAnalyticsProjectionCycle({ tenantId: tenant.id });
      results.push({
        tenantId: tenant.id,
        status: "generated",
        reconciledEvents: generated.reconciledEvents
      });
    } catch (error) {
      console.error(`[swim-analytics] Projection cycle failed for tenant ${tenant.id}`, error);
      results.push({
        tenantId: tenant.id,
        status: "failed",
        error: error instanceof Error ? error.message : "unexpected"
      });
    }
  }
  return NextResponse.json({
    accepted: true,
    processed: results.length,
    failed: results.filter((result) => result.status === "failed").length,
    results
  });
}

function hasValidCronSecret(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization");
  const actual = authorization?.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : request.headers.get("x-cron-secret")?.trim() ?? "";
  if (!expected || expected.length < 32 || !actual) return false;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
