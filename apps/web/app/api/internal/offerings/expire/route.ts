import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasValidAutomationToken(request)) {
    return NextResponse.json({ accepted: false }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as { tenantId?: unknown };
  const tenantId = typeof body.tenantId === "string" && isUuid(body.tenantId)
    ? body.tenantId
    : null;
  if (body.tenantId !== undefined && !tenantId) {
    return NextResponse.json({ accepted: false, reason: "invalid_tenant" }, { status: 400 });
  }

  const result = await createAdminClient().rpc("expire_offering_holds", {
    target_tenant_id: tenantId
  });
  if (result.error) {
    console.error("[offerings] hold expiry job failed", {
      code: result.error.code,
      tenantId
    });
    return NextResponse.json({ accepted: false, reason: "expiry_failed" }, { status: 503 });
  }

  return NextResponse.json({
    accepted: true,
    expired: Number(result.data ?? 0)
  });
}

function hasValidAutomationToken(request: Request) {
  const expected = process.env.BILLING_AUTOMATION_SECRET?.trim();
  const authorization = request.headers.get("authorization");
  const actual = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!expected || expected.length < 32 || !actual) return false;

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
