import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { runEnabledAutomationRecipes } from "@/lib/domain/automation-recipes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasValidCronSecret(request)) {
    return NextResponse.json({ accepted: false, reason: "unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({})) as { tenantId?: unknown };
  const tenantId = typeof body.tenantId === "string" && isUuid(body.tenantId)
    ? body.tenantId
    : undefined;
  if (body.tenantId !== undefined && !tenantId) {
    return NextResponse.json({ accepted: false, reason: "invalid_tenant" }, { status: 400 });
  }

  try {
    const results = await runEnabledAutomationRecipes({ tenantId });
    return NextResponse.json({
      accepted: true,
      failed: results.filter(({ result }) => result.action === "failed").length,
      reviewTasksCreated: results.filter(({ result }) => result.action === "review_task_created").length,
      processed: results.length,
      simulatedExternalDeliveries: 0,
      results: results.map(({ recipeKey, result, tenantId: resultTenantId }) => ({
        action: result.action,
        recipeKey,
        runId: result.runId,
        tenantId: resultTenantId
      }))
    });
  } catch (error) {
    console.error("[automation-recipes] tick failed", error);
    return NextResponse.json(
      { accepted: false, reason: "runner_failed" },
      { status: 503 }
    );
  }
}

function hasValidCronSecret(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-cron-secret")?.trim();
  const actual = authorization?.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : headerSecret ?? "";
  if (!expected || expected.length < 32 || !actual) return false;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
