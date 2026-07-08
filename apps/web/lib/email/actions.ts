"use server";

import { redirect } from "next/navigation";
import { sendTransactionalEmail } from "./transactional";
import { getExistingPlatformEmailSecrets, savePlatformEmailSettings, type EmailProvider } from "./platform-settings";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";

const settingsPath = "/platform/instellingen";

export async function savePlatformEmailSettingsAction(formData: FormData) {
  const context = await requirePlatformOwner();
  const enabled = formData.get("enabled") === "on";
  const provider = readProvider(formData);
  const fromEmail = nullableString(formData, "fromEmail");
  const fromName = nullableString(formData, "fromName") ?? "NXTTRACK";
  const smtpHost = nullableString(formData, "smtpHost");
  const smtpPort = readPort(formData, "smtpPort");
  const smtpSecure = readString(formData, "smtpEncryption") === "tls";
  const smtpUser = nullableString(formData, "smtpUser");
  const submittedSmtpPassword = nullableString(formData, "smtpPassword");
  const submittedSendGridApiKey = nullableString(formData, "sendGridApiKey");
  const clearSmtpPassword = formData.get("clearSmtpPassword") === "on";
  const clearSendGridApiKey = formData.get("clearSendGridApiKey") === "on";
  const existingSecrets = await getExistingPlatformEmailSecrets();
  const smtpPassword = clearSmtpPassword ? null : submittedSmtpPassword ?? existingSecrets.smtpPassword;
  const sendGridApiKey = clearSendGridApiKey ? null : submittedSendGridApiKey ?? existingSecrets.sendGridApiKey;

  if (!smtpPort || smtpPort < 1 || smtpPort > 65535) {
    redirect(`${settingsPath}?error=invalid_port`);
  }

  if (fromEmail && !isEmail(fromEmail)) {
    redirect(`${settingsPath}?error=invalid_email`);
  }

  if (enabled && (!fromEmail || !isEmail(fromEmail))) {
    redirect(`${settingsPath}?error=missing_from`);
  }

  if (enabled && provider === "sendgrid_api" && !sendGridApiKey) {
    redirect(`${settingsPath}?error=missing_sendgrid`);
  }

  if (enabled && provider === "smtp" && (!smtpHost || !smtpUser || !smtpPassword)) {
    redirect(`${settingsPath}?error=missing_smtp`);
  }

  try {
    await savePlatformEmailSettings({
      enabled,
      fromEmail,
      fromName,
      provider,
      sendGridApiKey,
      smtpHost,
      smtpPassword,
      smtpPort,
      smtpSecure,
      smtpUser,
      updatedByUserId: context.user.id
    });
  } catch {
    redirect(`${settingsPath}?error=save_failed`);
  }

  redirect(`${settingsPath}?saved=1`);
}

export async function sendPlatformEmailTestAction(formData: FormData) {
  const context = await requirePlatformOwner();
  const to = nullableString(formData, "testEmail") ?? context.user.email;

  if (!to || !isEmail(to)) {
    redirect(`${settingsPath}?test=invalid_email`);
  }

  const result = await sendTransactionalEmail({
    to,
    subject: "NXTTRACK mail test",
    text: "Dit is een testmail vanuit de NXTTRACK platform admin instellingen.",
    html: "<p>Dit is een testmail vanuit de NXTTRACK platform admin instellingen.</p>"
  });

  redirect(`${settingsPath}?test=${result.delivered ? "sent" : "failed"}`);
}

async function requirePlatformOwner() {
  const context = await requirePrivateShellContext(settingsPath);

  if (!context.platform?.roles.includes("platform_owner")) {
    redirect("/platform?error=forbidden");
  }

  return context;
}

function readProvider(formData: FormData): EmailProvider {
  return readString(formData, "provider") === "smtp" ? "smtp" : "sendgrid_api";
}

function readString(formData: FormData, field: string) {
  const value = formData.get(field);

  return typeof value === "string" ? value.trim() : "";
}

function nullableString(formData: FormData, field: string) {
  const value = readString(formData, field);

  return value === "" ? null : value;
}

function readPort(formData: FormData, field: string) {
  const value = Number.parseInt(readString(formData, field), 10);

  return Number.isInteger(value) ? value : null;
}

function isEmail(value: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}
