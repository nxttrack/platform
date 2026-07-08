import "server-only";

import { getConfiguredEmailDeliveryConfig, type SendGridApiEmailConfig } from "./platform-settings";
import { sendSmtpEmail } from "./smtp";

export type TransactionalEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type TransactionalEmailResult =
  | {
      delivered: true;
      provider: "sendgrid_api" | "smtp";
      source?: "env" | "platform_settings";
    }
  | {
      delivered: false;
      provider: "not_configured" | "sendgrid_api" | "smtp";
      reason: string;
      source?: "env" | "platform_settings";
    };

export async function sendTransactionalEmail(input: TransactionalEmailInput): Promise<TransactionalEmailResult> {
  const config = await getConfiguredEmailDeliveryConfig();

  if (!config) {
    return {
      delivered: false,
      provider: "not_configured",
      reason: "Configureer SendGrid API of SMTP in de platform admin instellingen."
    };
  }

  if (config.provider === "sendgrid_api") {
    return sendWithSendGridApi(config, input);
  }

  try {
    await sendSmtpEmail(config, input);

    return {
      delivered: true,
      provider: "smtp",
      source: config.source
    };
  } catch (error) {
    return {
      delivered: false,
      provider: "smtp",
      reason: error instanceof Error ? error.message : String(error),
      source: config.source
    };
  }
}

async function sendWithSendGridApi(config: SendGridApiEmailConfig, input: TransactionalEmailInput): Promise<TransactionalEmailResult> {
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: input.to }]
        }
      ],
      from: {
        email: config.fromEmail,
        name: config.fromName
      },
      subject: input.subject,
      content: [
        {
          type: input.html ? "text/html" : "text/plain",
          value: input.html ?? input.text
        }
      ]
    })
  });

  if (!response.ok) {
    return {
      delivered: false,
      provider: "sendgrid_api",
      reason: `SendGrid API returned ${response.status}.`,
      source: config.source
    };
  }

  return {
    delivered: true,
    provider: "sendgrid_api",
    source: config.source
  };
}
