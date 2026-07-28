import "server-only";

import webPush from "web-push";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getOwnWebPushSettings(path: `/${string}`) {
  const context = await requirePrivateShellContext(path);
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const [subscriptions, preferences] = await Promise.all([
    admin.from("web_push_subscriptions").select("id, status").eq("tenant_id", tenant.id).eq("user_id", context.user.id).eq("status", "active"),
    admin.from("web_push_preferences").select("lesson_changes, new_messages, reminders, quiet_hours_start, quiet_hours_end").eq("tenant_id", tenant.id).eq("user_id", context.user.id).maybeSingle()
  ]);
  if (subscriptions.error || preferences.error) throw new Error("Could not load push preferences.");
  return {
    configured: hasWebPushConfiguration(),
    enabled: (subscriptions.data?.length ?? 0) > 0,
    publicKey: process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim() ?? "",
    preferences: {
      lessonChanges: preferences.data?.lesson_changes !== false,
      newMessages: preferences.data?.new_messages !== false,
      reminders: preferences.data?.reminders === true
    }
  };
}

export async function sendWebPushToUser(input: { body: string; tenantId: string; title: string; url: `/${string}`; userId: string }) {
  const config = getWebPushConfiguration();
  if (!config) return { delivered: 0, failed: 0, skipped: "not_configured" as const };
  webPush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  const admin = createAdminClient();
  const subscriptions = await admin.from("web_push_subscriptions")
    .select("id, endpoint, p256dh_key, auth_key")
    .eq("tenant_id", input.tenantId)
    .eq("user_id", input.userId)
    .eq("status", "active");
  if (subscriptions.error) return { delivered: 0, failed: 0, skipped: "lookup_failed" as const };
  let delivered = 0;
  let failed = 0;
  for (const subscription of subscriptions.data ?? []) {
    try {
      await webPush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { auth: subscription.auth_key, p256dh: subscription.p256dh_key }
      }, JSON.stringify({ body: input.body.slice(0, 180), title: input.title.slice(0, 80), url: input.url }), { TTL: 3600, urgency: "normal" });
      delivered += 1;
      await admin.from("web_push_subscriptions").update({ failure_count: 0, last_success_at: new Date().toISOString() }).eq("id", subscription.id);
    } catch (error) {
      failed += 1;
      const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
      await admin.from("web_push_subscriptions").update({
        failure_count: 1,
        last_failure_at: new Date().toISOString(),
        status: statusCode === 404 || statusCode === 410 ? "invalid" : "active"
      }).eq("id", subscription.id);
    }
  }
  return { delivered, failed };
}

export function hasWebPushConfiguration() {
  return Boolean(getWebPushConfiguration());
}

function getWebPushConfiguration() {
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject || !/^mailto:[^@]+@[^@]+$|^https:\/\//.test(subject)) return null;
  return { privateKey, publicKey, subject };
}
