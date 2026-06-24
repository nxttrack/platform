import "server-only";

import nodemailer from "nodemailer";

export type LiveEmailProvider = "smtp" | "sendgrid";

export type LiveSmtpSettings = {
  status: string;
  host: string | null;
  port: number | null;
  secure: boolean | null;
  from_email: string | null;
  from_name: string | null;
  reply_to_email: string | null;
  username_secret_reference: string | null;
  password_secret_reference: string | null;
};

export type TemporaryPasswordEmailInput = {
  to: string;
  fullName: string | null;
  tenantName: string;
  loginUrl: string;
  temporaryPassword: string;
  expiresAt: string;
  reason: "invite" | "reset";
};

export type LiveEmailResult = {
  provider: LiveEmailProvider;
  messageId: string | null;
};

export type LiveEmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type LiveEmailOptions = {
  smtpSettings?: LiveSmtpSettings | null;
};

export function assertLiveEmailConfigured(options: LiveEmailOptions = {}) {
  if (hasSmtpConfig(options.smtpSettings) || hasSendGridApiConfig(options.smtpSettings)) {
    return;
  }

  throw new Error("Emailverzending is niet geconfigureerd. Vul SMTP_* of SENDGRID_API_KEY + SMTP_FROM_EMAIL in.");
}

export async function sendLiveEmail(input: LiveEmailMessage, options: LiveEmailOptions = {}): Promise<LiveEmailResult> {
  assertLiveEmailConfigured(options);

  if (hasSmtpConfig(options.smtpSettings)) {
    return sendViaSmtp(input, options.smtpSettings);
  }

  return sendViaSendGridApi(input, options.smtpSettings);
}

export async function sendTemporaryPasswordEmail(input: TemporaryPasswordEmailInput, options: LiveEmailOptions = {}): Promise<LiveEmailResult> {
  return sendLiveEmail(
    {
      to: input.to,
      subject: emailSubject(input),
      text: emailText(input),
      html: emailHtml(input)
    },
    options
  );
}

async function sendViaSmtp(input: LiveEmailMessage, settings: LiveSmtpSettings | null | undefined): Promise<LiveEmailResult> {
  const config = resolveSmtpConfig(settings);
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass
    }
  });
  const result = await transporter.sendMail({
    from: formatFromAddress(config.fromEmail, config.fromName),
    to: input.to,
    replyTo: config.replyToEmail ?? undefined,
    subject: input.subject,
    text: input.text,
    html: input.html
  });

  return {
    provider: "smtp",
    messageId: result.messageId ?? null
  };
}

async function sendViaSendGridApi(input: LiveEmailMessage, settings: LiveSmtpSettings | null | undefined): Promise<LiveEmailResult> {
  const fromEmail = settings?.from_email ?? requiredEnv("SMTP_FROM_EMAIL");
  const fromName = settings?.from_name ?? process.env.SMTP_FROM_NAME ?? "NXTTRACK";
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requiredEnv("SENDGRID_API_KEY")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: input.to }] }],
      from: {
        email: fromEmail,
        name: fromName
      },
      subject: input.subject,
      content: [
        {
          type: "text/plain",
          value: input.text
        },
        {
          type: "text/html",
          value: input.html ?? input.text
        }
      ]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SendGrid accepteerde de email niet: ${response.status} ${body}`);
  }

  return {
    provider: "sendgrid",
    messageId: response.headers.get("x-message-id")
  };
}

function emailSubject(input: TemporaryPasswordEmailInput) {
  return input.reason === "reset" ? `Nieuw tijdelijk wachtwoord voor ${input.tenantName}` : `Je NXTTRACK toegang voor ${input.tenantName}`;
}

function emailText(input: TemporaryPasswordEmailInput) {
  const greeting = input.fullName ? `Hallo ${input.fullName},` : "Hallo,";

  return [
    greeting,
    "",
    `Er is tenant super admin toegang voor ${input.tenantName} klaargezet in NXTTRACK.`,
    "",
    `Login: ${input.loginUrl}`,
    `E-mail: ${input.to}`,
    `Tijdelijk wachtwoord: ${input.temporaryPassword}`,
    "",
    "Na het inloggen moet je direct een nieuw wachtwoord instellen.",
    `Openstaande uitnodiging in de audit: ${formatDate(input.expiresAt)}.`,
    "",
    "NXTTRACK"
  ].join("\n");
}

function emailHtml(input: TemporaryPasswordEmailInput) {
  const greeting = input.fullName ? `Hallo ${escapeHtml(input.fullName)},` : "Hallo,";

  return `
    <div style="font-family:Inter,Arial,sans-serif;color:#0f172a;line-height:1.6">
      <p>${greeting}</p>
      <p>Er is tenant super admin toegang voor <strong>${escapeHtml(input.tenantName)}</strong> klaargezet in NXTTRACK.</p>
      <p><a href="${escapeHtml(input.loginUrl)}">Log in op NXTTRACK</a></p>
      <p><strong>E-mail:</strong> ${escapeHtml(input.to)}<br><strong>Tijdelijk wachtwoord:</strong> ${escapeHtml(input.temporaryPassword)}</p>
      <p>Na het inloggen moet je direct een nieuw wachtwoord instellen.</p>
      <p>Openstaande uitnodiging in de audit: ${escapeHtml(formatDate(input.expiresAt))}.</p>
      <p>NXTTRACK</p>
    </div>
  `;
}

function formatFromAddress(fromEmail: string, fromName?: string | null) {
  return fromName ? `"${fromName.replaceAll('"', "")}" <${fromEmail}>` : fromEmail;
}

function hasSmtpConfig(settings: LiveSmtpSettings | null | undefined) {
  try {
    resolveSmtpConfig(settings);
    return true;
  } catch {
    return false;
  }
}

function hasSendGridApiConfig(settings: LiveSmtpSettings | null | undefined) {
  return Boolean(process.env.SENDGRID_API_KEY && (settings?.from_email ?? process.env.SMTP_FROM_EMAIL));
}

function resolveSmtpConfig(settings: LiveSmtpSettings | null | undefined) {
  const globalSettingsEnabled = settings?.status === "active" || settings?.status === "configured";
  const usernameSecretReference = globalSettingsEnabled ? settings.username_secret_reference || "SMTP_USER" : "SMTP_USER";
  const passwordSecretReference = globalSettingsEnabled ? settings.password_secret_reference || "SMTP_PASS" : "SMTP_PASS";
  const host = globalSettingsEnabled ? settings.host ?? process.env.SMTP_HOST : process.env.SMTP_HOST;
  const port = globalSettingsEnabled ? settings.port ?? Number.parseInt(process.env.SMTP_PORT ?? "587", 10) : Number.parseInt(process.env.SMTP_PORT ?? "587", 10);
  const fromEmail = globalSettingsEnabled ? settings.from_email ?? process.env.SMTP_FROM_EMAIL : process.env.SMTP_FROM_EMAIL;
  const fromName = globalSettingsEnabled ? settings.from_name ?? process.env.SMTP_FROM_NAME : process.env.SMTP_FROM_NAME;
  const replyToEmail = globalSettingsEnabled ? settings.reply_to_email ?? null : null;
  const secure = globalSettingsEnabled ? Boolean(settings.secure) : port === 465;
  const user = process.env[usernameSecretReference] ?? process.env.SMTP_USER;
  const pass = process.env[passwordSecretReference] ?? process.env.SMTP_PASS;

  if (!host || !Number.isFinite(port) || !fromEmail || !user || !pass) {
    throw new Error("SMTP is niet volledig geconfigureerd.");
  }

  return {
    host,
    port,
    secure,
    fromEmail,
    fromName,
    replyToEmail,
    user,
    pass
  };
}

function requiredEnv(key: string) {
  const value = process.env[key];

  if (!value) {
    throw new Error(`${key} is niet geconfigureerd.`);
  }

  return value;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Amsterdam"
  }).format(new Date(value));
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
