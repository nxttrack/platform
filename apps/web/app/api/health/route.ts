import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const supabaseAuthConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );

  return NextResponse.json({
    ok: true,
    app: "nxttrack-platform",
    env: process.env.APP_ENV ?? "development",
    commit: process.env.COMMIT_SHA ?? null,
    supabaseAuthConfigured
  });
}
