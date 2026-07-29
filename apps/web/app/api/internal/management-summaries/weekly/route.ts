import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { generateManagementSummaryDraft } from "@/lib/domain/management-summaries";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasValidCronSecret(request)) return NextResponse.json({ accepted: false, reason: "unauthorized" }, { status: 401 });
  if (process.env.INTERNAL_JOBS_ENABLED !== "true") return NextResponse.json({ accepted: false, reason: "release_gate_disabled" }, { status: 423 });
  const tenants = await createAdminClient().from("tenants").select("id").eq("status", "active");
  if (tenants.error) return NextResponse.json({ accepted: false, reason: "tenant_lookup" }, { status: 503 });
  const results: Array<{ tenantId: string; status: "generated" | "failed" }> = [];
  for (const tenant of tenants.data ?? []) {
    try { await generateManagementSummaryDraft({ tenantId: tenant.id }); results.push({ tenantId: tenant.id, status: "generated" }); }
    catch { results.push({ tenantId: tenant.id, status: "failed" }); }
  }
  return NextResponse.json({ accepted: true, processed: results.length, failed: results.filter((row) => row.status === "failed").length, results });
}

function hasValidCronSecret(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization");
  const actual = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : request.headers.get("x-cron-secret")?.trim() ?? "";
  if (!expected || expected.length < 32 || !actual) return false;
  const left = Buffer.from(expected); const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}
