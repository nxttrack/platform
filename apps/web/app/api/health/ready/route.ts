import { NextResponse } from "next/server";

import { getReleaseMetadata } from "@/lib/observability/release";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export function GET() {
  const supabaseAuthConfigured = Boolean(getSupabasePublicConfig());
  const databaseConfigured = Boolean(process.env.DATABASE_URL);
  const emailConfigured = Boolean(
    process.env.SENDGRID_API_KEY ||
      (process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_FROM_EMAIL)
  );
  const ready = supabaseAuthConfigured && databaseConfigured;

  return NextResponse.json(
    {
      ok: ready,
      status: ready ? "ready" : "degraded",
      app: "nxttrack-platform",
      release: getReleaseMetadata(),
      checks: {
        databaseConfigured,
        emailConfigured,
        supabaseAuthConfigured
      },
      timestamp: new Date().toISOString()
    },
    { status: ready ? 200 : 503 }
  );
}
