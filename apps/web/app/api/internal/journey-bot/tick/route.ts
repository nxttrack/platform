import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { getJourneyBotEnvironmentStatus, runDueJourneyBotConfigs } from "@/lib/domain/journey-bot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const environment = getJourneyBotEnvironmentStatus();
  if (!environment.allowed) {
    return NextResponse.json({ accepted: false, reason: "environment_blocked" }, { status: 403 });
  }
  if (!hasValidCronSecret(request)) {
    return NextResponse.json({ accepted: false, reason: "unauthorized" }, { status: 401 });
  }

  try {
    const results = await runDueJourneyBotConfigs();
    return NextResponse.json({ accepted: true, environment: environment.environment, processed: results.length, results });
  } catch (error) {
    return NextResponse.json(
      { accepted: false, reason: "runner_failed", message: error instanceof Error ? error.message : String(error) },
      { status: 503 }
    );
  }
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
