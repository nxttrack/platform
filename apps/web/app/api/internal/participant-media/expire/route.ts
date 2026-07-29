import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { expireParticipantMedia } from "@/lib/domain/participant-media-lifecycle";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasValidCronSecret(request)) {
    return NextResponse.json({ accepted: false, reason: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await expireParticipantMedia();
    return NextResponse.json({ accepted: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        accepted: false,
        reason: "expiry_failed",
        message: error instanceof Error ? error.message : String(error)
      },
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
