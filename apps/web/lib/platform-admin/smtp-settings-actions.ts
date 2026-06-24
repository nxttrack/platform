"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { buildPath } from "@/lib/auth/redirects";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { sendLiveEmail, type LiveSmtpSettings } from "@/lib/communication/live-email";
import { createAdminClient } from "@/lib/supabase/admin";

const platformPath = "/platform";
const platformWriteRoles = ["platform_owner", "platform_admin"] as const;

type ActionResult = {
  notice?: string;
  error?: string;
};

type PlatformSmtpSettingsForAction = LiveSmtpSettings & {
  id: string;
  mode: string;
  test_recipient_email: string | null;
};

export async function updatePlatformSmtpSettingsAction(formData: FormData) {
  const result = await updatePlatformSmtpSettings(formData);

  redirectWithResult(result);
}

export async function sendPlatformSmtpTestEmailAction(formData: FormData) {
  const result = await sendPlatformSmtpTestEmail(formData);

  redirectWithResult(result);
}

async function updatePlatformSmtpSettings(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePlatformWriter();
    const admin = createAdminClient();
    const host = requiredString(formData, "host");
    const port = intValue(formData, "port", 587, 1, 65535);
    const fromEmail = optionalEmail(formData, "from_email");
    const replyToEmail = optionalEmail(formData, "reply_to_email");
    const testRecipientEmail = optionalEmail(formData, "test_recipient_email");

    await throwOnError(
      admin.from("platform_smtp_settings").upsert(
        {
          id: "global",
          status: enumValue(formData, "status", ["disabled", "configured", "active"], "configured"),
          mode: enumValue(formData, "mode", ["test", "live"], "test"),
          host,
          port,
          secure: formData.get("secure") === "on",
          from_email: fromEmail,
          from_name: optionalString(formData, "from_name"),
          reply_to_email: replyToEmail,
          username_secret_reference: optionalString(formData, "username_secret_reference") ?? "SMTP_USER",
          password_secret_reference: optionalString(formData, "password_secret_reference") ?? "SMTP_PASS",
          test_recipient_email: testRecipientEmail,
          updated_by_profile_id: actor.userId,
          metadata: {
            scope: "platform_global",
            updated_via: "platform_admin"
          }
        },
        { onConflict: "id" }
      )
    );

    revalidatePlatform();

    return { notice: "Globale SMTP instellingen zijn opgeslagen." };
  } catch (cause) {
    return { error: getErrorMessage(cause) };
  }
}

async function sendPlatformSmtpTestEmail(formData: FormData): Promise<ActionResult> {
  let admin: ReturnType<typeof createAdminClient> | null = null;
  let settings: PlatformSmtpSettingsForAction | null = null;

  try {
    const actor = await requirePlatformWriter();
    admin = createAdminClient();
    settings = await getGlobalSmtpSettings(admin);
    const recipient = optionalEmail(formData, "test_recipient_email") ?? settings.test_recipient_email ?? actor.email;

    if (!recipient) {
      throw new Error("Vul eerst een testontvanger in of gebruik een platform admin met e-mailadres.");
    }

    const delivery = await sendLiveEmail(
      {
        to: recipient,
        subject: "NXTTRACK globale SMTP test",
        text: [
          "Dit is een testmail vanuit het NXTTRACK platform admin dashboard.",
          "",
          `Provider: SMTP`,
          `Host: ${settings.host}`,
          `Mode: ${settings.mode}`,
          "",
          "Als je deze mail ontvangt, werkt de globale SMTP-configuratie."
        ].join("\n"),
        html: `
          <div style="font-family:Inter,Arial,sans-serif;color:#0f172a;line-height:1.6">
            <p>Dit is een testmail vanuit het NXTTRACK platform admin dashboard.</p>
            <p><strong>Provider:</strong> SMTP<br><strong>Host:</strong> ${escapeHtml(settings.host ?? "")}<br><strong>Mode:</strong> ${escapeHtml(settings.mode)}</p>
            <p>Als je deze mail ontvangt, werkt de globale SMTP-configuratie.</p>
          </div>
        `
      },
      { smtpSettings: settings }
    );

    await markTestResult(admin, "sent", null, delivery.messageId);
    revalidatePlatform();

    return { notice: `Testmail is verzonden naar ${recipient}.` };
  } catch (cause) {
    if (admin) {
      await markTestResult(admin, "failed", getErrorMessage(cause), null).catch(() => undefined);
    }

    return { error: getErrorMessage(cause) };
  }
}

async function requirePlatformWriter() {
  const context = await getTrustedAuthContext();

  if (context.status !== "authenticated" || !context.platform?.roles.some((role) => platformWriteRoles.includes(role as (typeof platformWriteRoles)[number]))) {
    throw new Error("Je hebt platform admin rechten nodig om globale SMTP instellingen te beheren.");
  }

  return {
    userId: context.user.id,
    email: context.user.email
  };
}

async function getGlobalSmtpSettings(admin: ReturnType<typeof createAdminClient>): Promise<PlatformSmtpSettingsForAction> {
  const { data, error } = await admin
    .from("platform_smtp_settings")
    .select("id, status, mode, host, port, secure, from_email, from_name, reply_to_email, username_secret_reference, password_secret_reference, test_recipient_email")
    .eq("id", "global")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Globale SMTP instellingen zijn nog niet opgeslagen.");
  }

  return data as PlatformSmtpSettingsForAction;
}

async function markTestResult(admin: ReturnType<typeof createAdminClient>, status: "sent" | "failed", errorMessage: string | null, messageId: string | null) {
  await throwOnError(
    admin
      .from("platform_smtp_settings")
      .update({
        last_tested_at: new Date().toISOString(),
        last_test_status: status,
        last_test_error: errorMessage,
        metadata: {
          last_test_message_id: messageId
        }
      })
      .eq("id", "global")
  );
}

function redirectWithResult(result: ActionResult): never {
  revalidatePlatform();
  redirect(buildPath(platformPath, result));
}

function revalidatePlatform() {
  revalidatePath("/platform");
  revalidatePath("/platform/tenants");
}

async function throwOnError(builder: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await builder;

  if (error) {
    throw new Error(error.message);
  }
}

function requiredString(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) {
    throw new Error(`${key} is verplicht.`);
  }

  return value;
}

function optionalString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

function optionalEmail(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error(`${key} is geen geldig e-mailadres.`);
  }

  return normalized;
}

function enumValue<const Value extends string>(formData: FormData, key: string, allowed: readonly Value[], fallback: Value) {
  const value = optionalString(formData, key) ?? fallback;

  return allowed.includes(value as Value) ? (value as Value) : fallback;
}

function intValue(formData: FormData, key: string, fallback: number, min: number, max: number) {
  const value = optionalString(formData, key);
  const parsed = value ? Number.parseInt(value, 10) : fallback;

  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${key} heeft geen geldige waarde.`);
  }

  return parsed;
}

function getErrorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : "Actie kon niet worden afgerond.";
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
