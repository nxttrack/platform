import { NextResponse } from "next/server";
import { requireApiAuthenticatedContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const guard = await requireApiAuthenticatedContext();
  if (!guard.ok) return guard.response;
  const tenant = getActiveTenant(guard.context);
  const body = await request.json().catch(() => null) as null | {
    subscription?: { endpoint?: unknown; keys?: { auth?: unknown; p256dh?: unknown } };
    preferences?: { lessonChanges?: unknown; newMessages?: unknown; reminders?: unknown };
  };
  const endpoint = stringValue(body?.subscription?.endpoint, 20, 4096);
  const authKey = stringValue(body?.subscription?.keys?.auth, 8, 256);
  const p256dh = stringValue(body?.subscription?.keys?.p256dh, 20, 512);
  if (!endpoint || !authKey || !p256dh || !isSafePushEndpoint(endpoint)) return NextResponse.json({ error: "invalid_subscription" }, { status: 400 });
  const admin = createAdminClient();
  const [subscription, preferences] = await Promise.all([
    admin.from("web_push_subscriptions").upsert({
      tenant_id: tenant.id,
      user_id: guard.context.user.id,
      endpoint,
      p256dh_key: p256dh,
      auth_key: authKey,
      user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
      status: "active",
      consent_recorded_at: new Date().toISOString(),
      failure_count: 0
    }, { onConflict: "tenant_id,user_id,endpoint" }),
    admin.from("web_push_preferences").upsert({
      tenant_id: tenant.id,
      user_id: guard.context.user.id,
      lesson_changes: body?.preferences?.lessonChanges !== false,
      new_messages: body?.preferences?.newMessages !== false,
      reminders: body?.preferences?.reminders === true
    }, { onConflict: "tenant_id,user_id" })
  ]);
  if (subscription.error || preferences.error) return NextResponse.json({ error: "save_failed" }, { status: 503 });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const guard = await requireApiAuthenticatedContext();
  if (!guard.ok) return guard.response;
  const tenant = getActiveTenant(guard.context);
  const result = await createAdminClient().from("web_push_subscriptions").update({ status: "revoked" }).eq("tenant_id", tenant.id).eq("user_id", guard.context.user.id).eq("status", "active");
  return result.error ? NextResponse.json({ error: "save_failed" }, { status: 503 }) : NextResponse.json({ ok: true });
}

function stringValue(value: unknown, minimum: number, maximum: number) {
  return typeof value === "string" && value.length >= minimum && value.length <= maximum ? value : null;
}
function isSafePushEndpoint(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}
