import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasValidCronSecret(request)) {
    return NextResponse.json({ accepted: false, reason: "unauthorized" }, { status: 401 });
  }
  const result = await createAdminClient().rpc("execute_due_portal_theme_schedules", { target_limit: 50 });
  if (result.error) {
    console.error("[portal-themes] scheduled activation failed", result.error);
    return NextResponse.json({ accepted: false, reason: "runner_failed" }, { status: 503 });
  }
  const rows = (result.data ?? []) as Array<{ schedule_id: string; assignment_id: string | null; status: "executed" | "failed" }>;
  return NextResponse.json({
    accepted: true,
    processed: rows.length,
    executed: rows.filter((row) => row.status === "executed").length,
    failed: rows.filter((row) => row.status === "failed").length,
    results: rows
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
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}
