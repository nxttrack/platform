import { NextResponse } from "next/server";
import { requireApiAuthenticatedContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
import { sendWebPushToUser } from "@/lib/domain/web-push";

export async function POST() {
  const guard = await requireApiAuthenticatedContext();
  if (!guard.ok) return guard.response;
  const tenant = getActiveTenant(guard.context);
  const result = await sendWebPushToUser({
    body: "Meldingen zijn veilig ingesteld. Je kiest zelf welke updates je ontvangt.",
    tenantId: tenant.id,
    title: "NXTTRACK meldingen werken",
    url: "/portaal/profiel",
    userId: guard.context.user.id
  });
  return "skipped" in result
    ? NextResponse.json({ error: result.skipped }, { status: 503 })
    : NextResponse.json({ ok: result.delivered > 0, ...result }, { status: result.delivered > 0 ? 200 : 503 });
}
