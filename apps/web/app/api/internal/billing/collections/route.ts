import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import {
  MollieCollectionError,
  processMollieCollectionAttempt
} from "@/lib/domain/mollie-collection-processor";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const maximumAttemptsPerRun = 25;

export async function POST(request: Request) {
  if (!hasValidAutomationToken(request)) {
    return NextResponse.json({ accepted: false }, { status: 401 });
  }

  const admin = createAdminClient();
  const body = await request.json().catch(() => ({})) as { tenantId?: unknown };
  const requestedTenantId = typeof body.tenantId === "string" && isUuid(body.tenantId) ? body.tenantId : null;
  if (body.tenantId !== undefined && !requestedTenantId) {
    return NextResponse.json({ accepted: false, reason: "invalid_tenant" }, { status: 400 });
  }
  let configsQuery = admin
    .from("billing_provider_configs")
    .select("id, tenant_id, public_config")
    .eq("provider", "mollie")
    .eq("status", "active");
  if (requestedTenantId) configsQuery = configsQuery.eq("tenant_id", requestedTenantId);
  const configsResult = await configsQuery;
  if (configsResult.error) {
    return NextResponse.json({ accepted: false, reason: "provider_config_lookup" }, { status: 503 });
  }

  const enabledConfigs = (configsResult.data ?? []).filter((config) => {
    const publicConfig = (config.public_config ?? {}) as Record<string, unknown>;
    return publicConfig.recurring_enabled === true && publicConfig.automatic_collection_enabled === true;
  });
  if (enabledConfigs.length === 0) {
    return NextResponse.json({ accepted: true, failed: 0, processed: 0, skipped: 0 });
  }

  const configIds = enabledConfigs.map((config) => config.id);
  const tenantIds = [...new Set(enabledConfigs.map((config) => config.tenant_id))];
  const now = new Date().toISOString();
  const [prenotifiedResult, indeterminateResult, tenantsResult] = await Promise.all([
    admin
      .from("billing_collection_attempts")
      .select("id, tenant_id, provider_config_id, scheduled_for")
      .in("provider_config_id", configIds)
      .eq("status", "prenotified")
      .eq("prenotification_delivery_status", "sent")
      .lte("scheduled_for", now)
      .order("scheduled_for")
      .limit(maximumAttemptsPerRun),
    admin
      .from("billing_collection_attempts")
      .select("id, tenant_id, provider_config_id, scheduled_for")
      .in("provider_config_id", configIds)
      .eq("status", "processing")
      .eq("failure_code", "provider_outcome_unknown")
      .eq("prenotification_delivery_status", "sent")
      .lte("scheduled_for", now)
      .order("scheduled_for")
      .limit(maximumAttemptsPerRun),
    admin.from("tenants").select("id, name").in("id", tenantIds)
  ]);
  if (prenotifiedResult.error || indeterminateResult.error || tenantsResult.error) {
    return NextResponse.json({ accepted: false, reason: "collection_queue_lookup" }, { status: 503 });
  }

  const tenantNames = new Map((tenantsResult.data ?? []).map((tenant) => [tenant.id, tenant.name]));
  const queue = [...(indeterminateResult.data ?? []), ...(prenotifiedResult.data ?? [])]
    .sort((left, right) => left.scheduled_for.localeCompare(right.scheduled_for))
    .slice(0, maximumAttemptsPerRun);
  const results: Array<{ attemptId: string; code: string; status: "failed" | "processed" | "skipped" }> = [];

  for (const attempt of queue) {
    const organizationName = tenantNames.get(attempt.tenant_id);
    if (!organizationName) {
      results.push({ attemptId: attempt.id, code: "tenant_missing", status: "skipped" });
      continue;
    }

    try {
      await processMollieCollectionAttempt({
        attemptId: attempt.id,
        organizationName,
        tenantId: attempt.tenant_id
      });
      results.push({ attemptId: attempt.id, code: "started", status: "processed" });
    } catch (error) {
      const code = error instanceof MollieCollectionError ? error.code : "unexpected";
      results.push({
        attemptId: attempt.id,
        code,
        status: ["already_processing", "not_due"].includes(code) ? "skipped" : "failed"
      });
    }
  }

  return NextResponse.json({
    accepted: true,
    failed: results.filter((result) => result.status === "failed").length,
    processed: results.filter((result) => result.status === "processed").length,
    results,
    skipped: results.filter((result) => result.status === "skipped").length
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
