import "server-only";

import nodemailer from "nodemailer";

export type LiveEmailProvider = "smtp" | "sendgrid";

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

export function assertLiveEmailConfigured() {
  if (hasSmtpConfig() || hasSendGridApiConfig()) {
    return;
  }

  throw new Error("Emailverzending is niet geconfigureerd. Vul SMTP_* of SENDGRID_API_KEY + SMTP_FROM_EMAIL in.");
}

export async function sendTemporaryPasswordEmail(input: TemporaryPasswordEmailInput): Promise<LiveEmailResult> {
  assertLiveEmailConfigured();

  if (hasSmtpConfig()) {
    return sendViaSmtp(input);
  }

  return sendViaSendGridApi(input);
}

async function sendViaSmtp(input: TemporaryPasswordEmailInput): Promise<LiveEmailResult> {
  const port = Number.parseInt(process.env.SMTP_PORT ?? "587", 10);
  const transporter = nodemailer.createTransport({
    host: requiredEnv("SMTP_HOST"),
    port,
    secure: port === 465,
    auth: {
      user: requiredEnv("SMTP_USER"),
      pass: requiredEnv("SMTP_PASS")
    }
  });
  const result = await transporter.sendMail({
    from: formatFromAddress(),
    to: input.to,
    subject: emailSubject(input),
    text: emailText(input),
    html: emailHtml(input)
  });

  return {
    provider: "smtp",
    messageId: result.messageId ?? null
  };
}

async function sendViaSendGridApi(input: TemporaryPasswordEmailInput): Promise<LiveEmailResult> {
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requiredEnv("SENDGRID_API_KEY")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: input.to }] }],
      from: {
        email: requiredEnv("SMTP_FROM_EMAIL"),
        name: process.env.SMTP_FROM_NAME || "NXTTRACK"
      },
      subject: emailSubject(input),
      content: [
        {
          type: "text/plain",
          value: emailText(input)
        },
        {
          type: "text/html",
          value: emailHtml(input)
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

function formatFromAddress() {
  const fromEmail = requiredEnv("SMTP_FROM_EMAIL");
  const fromName = process.env.SMTP_FROM_NAME;

  return fromName ? `"${fromName.replaceAll('"', "")}" <${fromEmail}>` : fromEmail;
}

function hasSmtpConfig() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM_EMAIL);
}

function hasSendGridApiConfig() {
  return Boolean(process.env.SENDGRID_API_KEY && process.env.SMTP_FROM_EMAIL);
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
