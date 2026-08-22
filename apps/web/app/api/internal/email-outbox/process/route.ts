import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";
import { EmailOutboxProcessingDisabledError, processEmailOutboxBatch } from "@/lib/email/outbox";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasValidCronSecret(request)) {
    return NextResponse.json({ accepted: false, reason: "unauthorized" }, { status: 401 });
  }
  if (process.env.INTERNAL_JOBS_ENABLED !== "true") {
    return NextResponse.json({ accepted: false, reason: "release_gate_disabled" }, { status: 423 });
  }

  const body = await request.json().catch(() => ({})) as { limit?: unknown };
  const requestedLimit = body.limit === undefined ? 25 : Number(body.limit);

  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
    return NextResponse.json({ accepted: false, reason: "invalid_limit" }, { status: 400 });
  }

  try {
    const results = await processEmailOutboxBatch({ limit: requestedLimit });
    return NextResponse.json({
      accepted: true,
      claimed: results.length,
      providerAccepted: results.filter((result) => result.status === "accepted").length,
      retried: results.filter((result) => result.status === "retry").length,
      dead: results.filter((result) => result.status === "dead").length,
      failed: results.filter((result) => result.status === "failed").length
    });
  } catch (error) {
    if (error instanceof EmailOutboxProcessingDisabledError) {
      return NextResponse.json({ accepted: false, reason: "email_sending_disabled" }, { status: 423 });
    }
    console.error("[email-outbox] worker failed", {
      code: error instanceof Error && /claim/i.test(error.message) ? "claim_failed" : "worker_failed"
    });
    return NextResponse.json({ accepted: false, reason: "worker_failed" }, { status: 503 });
  }
}

function hasValidCronSecret(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization");
  const actual = authorization?.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : request.headers.get("x-cron-secret")?.trim() ?? "";

  if (!expected || expected.length < 32 || !actual) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}
