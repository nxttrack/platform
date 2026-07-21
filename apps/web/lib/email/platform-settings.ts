import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export type EmailProvider = "sendgrid_api" | "smtp";

export type PlatformEmailSettingsView = {
  enabled: boolean;
  settingsAvailable: boolean;
  fromEmail: string;
  fromName: string;
  hasSendGridApiKey: boolean;
  hasSmtpPassword: boolean;
  provider: EmailProvider;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  updatedAt: string | null;
};

export type SendGridApiEmailConfig = {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  provider: "sendgrid_api";
  source: "platform_settings" | "env";
};

export type SmtpEmailConfig = {
  fromEmail: string;
  fromName: string;
  host: string;
  password: string;
  port: number;
  provider: "smtp";
  secure: boolean;
  source: "platform_settings" | "env";
  user: string;
};

export type EmailDeliveryConfig = SendGridApiEmailConfig | SmtpEmailConfig;

export type PlatformEmailSecrets = {
  sendGridApiKey: string | null;
  smtpPassword: string | null;
};

export type PlatformEmailTestAttemptView = {
  attemptedAt: string;
  deliveredAt: string | null;
  errorMessage: string | null;
  id: string;
  provider: string;
  providerMessageId: string | null;
  recipientEmail: string;
  status: string;
};

type PlatformEmailSettingsRow = {
  enabled: boolean;
  from_email: string | null;
  from_name: string | null;
  provider: EmailProvider | null;
  sendgrid_api_key_encrypted: string | null;
  smtp_host: string | null;
  smtp_password_encrypted: string | null;
  smtp_port: number | null;
  smtp_secure: boolean | null;
  smtp_user: string | null;
  updated_at: string | null;
};

const SETTINGS_ID = true;
const SECRET_PREFIX = "v1";

export async function getPlatformEmailSettingsView(): Promise<PlatformEmailSettingsView> {
  const { row, settingsAvailable } = await getPlatformEmailSettingsState();

  return toView(row ?? defaultRow(), settingsAvailable);
}

export async function getPlatformEmailTestAttempts(): Promise<PlatformEmailTestAttemptView[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("email_delivery_attempts")
    .select("id, recipient_email, provider, status, error_message, metadata, attempted_at, delivered_at")
    .is("tenant_id", null)
    .eq("template_key", "platform_delivery_test")
    .order("attempted_at", { ascending: false })
    .limit(10);

  if (error) {
    return [];
  }

  return (data ?? []).map((row) => {
    const metadata = isRecord(row.metadata) ? row.metadata : {};

    return {
      attemptedAt: row.attempted_at,
      deliveredAt: row.delivered_at,
      errorMessage: row.error_message,
      id: row.id,
      provider: row.provider,
      providerMessageId: typeof metadata.providerMessageId === "string" ? metadata.providerMessageId : null,
      recipientEmail: row.recipient_email,
      status: row.status
    };
  });
}

export async function savePlatformEmailSettings(input: {
  enabled: boolean;
  fromEmail: string | null;
  fromName: string | null;
  provider: EmailProvider;
  sendGridApiKey: string | null;
  smtpHost: string | null;
  smtpPassword: string | null;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string | null;
  updatedByUserId: string;
}) {
  const admin = createAdminClient();
  const { error } = await admin.from("platform_email_settings").upsert(
    {
      id: SETTINGS_ID,
      enabled: input.enabled,
      from_email: input.fromEmail,
      from_name: input.fromName || "NXTTRACK",
      provider: input.provider,
      sendgrid_api_key_encrypted: input.sendGridApiKey ? encryptSecret(input.sendGridApiKey) : null,
      smtp_host: input.smtpHost,
      smtp_password_encrypted: input.smtpPassword ? encryptSecret(input.smtpPassword) : null,
      smtp_port: input.smtpPort,
      smtp_secure: input.smtpSecure,
      smtp_user: input.smtpUser,
      updated_by_user_id: input.updatedByUserId
    },
    { onConflict: "id" }
  );

  if (error) {
    throw new Error(`Could not save platform email settings: ${error.message}`);
  }
}

export async function getExistingPlatformEmailSecrets(): Promise<PlatformEmailSecrets> {
  const { row } = await getPlatformEmailSettingsState();

  return {
    sendGridApiKey: row?.sendgrid_api_key_encrypted ? decryptSecret(row.sendgrid_api_key_encrypted) : null,
    smtpPassword: row?.smtp_password_encrypted ? decryptSecret(row.smtp_password_encrypted) : null
  };
}

export async function getConfiguredEmailDeliveryConfig(): Promise<EmailDeliveryConfig | null> {
  const { row } = await getPlatformEmailSettingsState();

  if (row) {
    return getPlatformEmailDeliveryConfig(row);
  }

  return getEnvSendGridApiConfig() ?? getEnvSmtpConfig();
}

async function getPlatformEmailSettingsState(): Promise<{ row: PlatformEmailSettingsRow | null; settingsAvailable: boolean }> {
  try {
    return {
      row: await getPlatformEmailSettingsRow(),
      settingsAvailable: true
    };
  } catch {
    return {
      row: null,
      settingsAvailable: false
    };
  }
}

async function getPlatformEmailSettingsRow(): Promise<PlatformEmailSettingsRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("platform_email_settings")
    .select("enabled, from_email, from_name, provider, sendgrid_api_key_encrypted, smtp_host, smtp_password_encrypted, smtp_port, smtp_secure, smtp_user, updated_at")
    .eq("id", SETTINGS_ID)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load platform email settings: ${error.message}`);
  }

  return (data as PlatformEmailSettingsRow | null) ?? null;
}

function getPlatformEmailDeliveryConfig(row: PlatformEmailSettingsRow): EmailDeliveryConfig | null {
  if (!row.enabled || !row.from_email) {
    return null;
  }

  if ((row.provider ?? "sendgrid_api") === "sendgrid_api") {
    const apiKey = row.sendgrid_api_key_encrypted ? decryptSecret(row.sendgrid_api_key_encrypted) : null;

    if (!apiKey) {
      return null;
    }

    return {
      apiKey,
      fromEmail: row.from_email,
      fromName: row.from_name || "NXTTRACK",
      provider: "sendgrid_api",
      source: "platform_settings"
    };
  }

  const password = row.smtp_password_encrypted ? decryptSecret(row.smtp_password_encrypted) : null;

  if (!row.smtp_host || !row.smtp_user || !password) {
    return null;
  }

  return {
    fromEmail: row.from_email,
    fromName: row.from_name || "NXTTRACK",
    host: row.smtp_host,
    password,
    port: row.smtp_port ?? 587,
    provider: "smtp",
    secure: row.smtp_secure ?? false,
    source: "platform_settings",
    user: row.smtp_user
  };
}

function getEnvSendGridApiConfig(): SendGridApiEmailConfig | null {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SMTP_FROM || process.env.SMTP_FROM_EMAIL;
  const fromName = process.env.SMTP_FROM_NAME || "NXTTRACK";

  if (!apiKey || !fromEmail) {
    return null;
  }

  return {
    apiKey,
    fromEmail,
    fromName,
    provider: "sendgrid_api",
    source: "env"
  };
}

function getEnvSmtpConfig(): SmtpEmailConfig | null {
  const host = process.env.SMTP_HOST;
  const port = Number.parseInt(process.env.SMTP_PORT ?? "587", 10);
  const sendgridApiKey = process.env.SENDGRID_API_KEY;
  const user = process.env.SMTP_USER || (host?.includes("sendgrid") && sendgridApiKey ? "apikey" : "");
  const password = process.env.SMTP_PASSWORD || process.env.SMTP_PASS || (host?.includes("sendgrid") ? sendgridApiKey : "");
  const fromEmail = process.env.SMTP_FROM || process.env.SMTP_FROM_EMAIL;
  const fromName = process.env.SMTP_FROM_NAME || "NXTTRACK";
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  if (!host || !fromEmail || !user || !password || !Number.isInteger(port)) {
    return null;
  }

  return {
    fromEmail,
    fromName,
    host,
    password,
    port,
    provider: "smtp",
    secure,
    source: "env",
    user
  };
}

function toView(row: PlatformEmailSettingsRow, settingsAvailable = true): PlatformEmailSettingsView {
  return {
    enabled: row.enabled,
    settingsAvailable,
    fromEmail: row.from_email ?? "",
    fromName: row.from_name ?? "NXTTRACK",
    hasSendGridApiKey: Boolean(row.sendgrid_api_key_encrypted),
    hasSmtpPassword: Boolean(row.smtp_password_encrypted),
    provider: row.provider ?? "sendgrid_api",
    smtpHost: row.smtp_host ?? "",
    smtpPort: row.smtp_port ?? 587,
    smtpSecure: row.smtp_secure ?? false,
    smtpUser: row.smtp_user ?? "",
    updatedAt: row.updated_at
  };
}

function defaultRow(): PlatformEmailSettingsRow {
  return {
    enabled: false,
    from_email: null,
    from_name: "NXTTRACK",
    provider: "sendgrid_api",
    sendgrid_api_key_encrypted: null,
    smtp_host: null,
    smtp_password_encrypted: null,
    smtp_port: 587,
    smtp_secure: false,
    smtp_user: null,
    updated_at: null
  };
}

function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [SECRET_PREFIX, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(":");
}

function decryptSecret(value: string) {
  const [prefix, iv, tag, ciphertext] = value.split(":");

  if (prefix !== SECRET_PREFIX || !iv || !tag || !ciphertext) {
    throw new Error("Unsupported encrypted email secret format.");
  }

  const decipher = createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));

  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

function secretKey() {
  const secret = process.env.EMAIL_SETTINGS_SECRET || process.env.SESSION_SECRET || process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("EMAIL_SETTINGS_SECRET, SESSION_SECRET or JWT_SECRET is required for email secret encryption.");
  }

  return createHash("sha256").update(secret).digest();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
