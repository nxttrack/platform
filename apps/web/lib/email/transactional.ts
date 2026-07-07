import "server-only";

export type TransactionalEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type TransactionalEmailResult =
  | {
      delivered: true;
      provider: "sendgrid";
    }
  | {
      delivered: false;
      provider: "not_configured";
      reason: string;
    };

export async function sendTransactionalEmail(input: TransactionalEmailInput): Promise<TransactionalEmailResult> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SMTP_FROM || process.env.SMTP_FROM_EMAIL;
  const fromName = process.env.SMTP_FROM_NAME || "NXTTRACK";

  if (!apiKey || !fromEmail) {
    return {
      delivered: false,
      provider: "not_configured",
      reason: "SENDGRID_API_KEY and SMTP_FROM or SMTP_FROM_EMAIL are required for email delivery."
    };
  }

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: input.to }]
        }
      ],
      from: {
        email: fromEmail,
        name: fromName
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
      provider: "not_configured",
      reason: `SendGrid returned ${response.status}.`
    };
  }

  return {
    delivered: true,
    provider: "sendgrid"
  };
}
