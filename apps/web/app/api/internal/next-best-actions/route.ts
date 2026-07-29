import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { generateNextBestActions } from "@/lib/domain/next-best-actions";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasValidCronSecret(request)) {
    return NextResponse.json({ accepted: false, reason: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as { tenantId?: unknown };
  const tenantId = typeof body.tenantId === "string" && isUuid(body.tenantId) ? body.tenantId : null;
  if (body.tenantId !== undefined && !tenantId) {
    return NextResponse.json({ accepted: false, reason: "invalid_tenant" }, { status: 400 });
  }

  const admin = createAdminClient();
  let tenantsQuery = admin.from("tenants").select("id, name").eq("status", "active").order("name");
  if (tenantId) tenantsQuery = tenantsQuery.eq("id", tenantId);
  const tenantsResult = await tenantsQuery;
  if (tenantsResult.error) {
    return NextResponse.json({ accepted: false, reason: "tenant_lookup" }, { status: 503 });
  }

  const results: Array<{
    tenantId: string;
    status: "generated" | "failed";
    detected?: number;
    autoResolved?: number;
    error?: string;
  }> = [];
  for (const tenant of tenantsResult.data ?? []) {
    try {
      const generated = await generateNextBestActions(tenant.id);
      results.push({
        tenantId: tenant.id,
        status: "generated",
        detected: generated.detected,
        autoResolved: generated.autoResolved
      });
    } catch (error) {
      console.error(`[next-best-actions] Generation failed for tenant ${tenant.id}`, error);
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
  const headerSecret = request.headers.get("x-cron-secret")?.trim();
  const actual = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : headerSecret ?? "";
  if (!expected || expected.length < 32 || !actual) return false;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
