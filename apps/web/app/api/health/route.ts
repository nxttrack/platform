import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true,
    app: "nxttrack-platform",
    env: process.env.APP_ENV ?? "development"
  });
}
