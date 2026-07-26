import "server-only";

type EmailTemplate = {
  html: string;
  subject: string;
  text: string;
};

type KeyValue = {
  label: string;
  value: string;
};

export function renderInvitationEmail(input: {
  acceptUrl: string;
  invitationCode: string;
  isNewAccount: boolean;
  organizationName: string;
  roleLabel: string;
  tenantSlug?: string | null;
}): EmailTemplate {
  const environment = input.tenantSlug ? `${input.organizationName} (${input.tenantSlug})` : input.organizationName;
  const rows: KeyValue[] = [
    { label: "Omgeving", value: environment },
    { label: "Rol", value: input.roleLabel },
    { label: "Eenmalige code", value: input.invitationCode },
    { label: "Uitnodiging openen", value: input.acceptUrl }
  ];

  return renderTemplate({
    actionLabel: "Uitnodiging accepteren",
    actionUrl: input.acceptUrl,
    organizationName: input.organizationName,
    preheader: `Je bent uitgenodigd voor ${input.organizationName}.`,
    rows,
    subject: `Je uitnodiging voor ${input.organizationName}`,
    title: "Je uitnodiging staat klaar",
    message: input.isNewAccount
      ? "Open de uitnodiging, vul je e-mailadres en de eenmalige code in en kies je eigen wachtwoord. De code verloopt automatisch."
      : "Open de uitnodiging en bevestig de extra toegang met je e-mailadres en de eenmalige code. Je bestaande wachtwoord blijft ongewijzigd."
  });
}

export function renderPasswordResetEmail(input: { code: string; organizationName?: string; resetLink: string }): EmailTemplate {
  return renderTemplate({
    actionLabel: "Code invullen",
    actionUrl: input.resetLink,
    organizationName: input.organizationName ?? "NXTTRACK",
    preheader: "Gebruik de 6-cijferige code om je wachtwoord te wijzigen.",
    rows: [
      { label: "Code", value: input.code },
      { label: "Link", value: input.resetLink }
    ],
    subject: "NXTTRACK wachtwoord wijzigen",
    title: "Wachtwoord wijzigen",
    message: "Je hebt een code aangevraagd om je wachtwoord te wijzigen. Deze code verloopt na 15 minuten."
  });
}

export function renderSlotOfferEmail(input: { offerCode: string; offerLink: string; organizationName: string; parentName: string; participantName: string }): EmailTemplate {
  return renderTemplate({
    actionLabel: "Aanbod bekijken",
    actionUrl: input.offerLink,
    organizationName: input.organizationName,
    preheader: `Er is een plek beschikbaar voor ${input.participantName}.`,
    rows: [
      { label: "Beveiligingscode", value: input.offerCode },
      { label: "Link", value: input.offerLink }
    ],
    subject: `Er is een plek beschikbaar bij ${input.organizationName}`,
    title: "Er is een plek beschikbaar",
    message: `Beste ${input.parentName}, er is een plek beschikbaar voor ${input.participantName}. Open de link en vul de 8-cijferige code in. Het aanbod verloopt na 7 dagen.`
  });
}

export function renderNotificationEmail(input: { message: string; organizationName: string; title: string }): EmailTemplate {
  return renderTemplate({
    organizationName: input.organizationName,
    preheader: input.message,
    rows: [],
    subject: `${input.organizationName}: ${input.title}`,
    title: input.title,
    message: input.message
  });
}

function renderTemplate(input: {
  actionLabel?: string;
  actionUrl?: string;
  message: string;
  organizationName: string;
  preheader: string;
  rows: KeyValue[];
  subject: string;
  title: string;
}): EmailTemplate {
  const textRows = input.rows.map((row) => `${row.label}: ${row.value}`);
  const text = [
    input.title,
    "",
    input.message,
    "",
    ...textRows,
    input.actionUrl && !textRows.some((row) => row.includes(input.actionUrl ?? "")) ? `Link: ${input.actionUrl}` : "",
    "",
    `Afzender: ${input.organizationName}`
  ]
    .filter(Boolean)
    .join("\n");
  const htmlRows = input.rows
    .map(
      (row) => `
        <tr>
          <td style="padding:8px 0;color:#64748b;font-size:13px;">${escapeHtml(row.label)}</td>
          <td style="padding:8px 0;color:#0f172a;font-size:13px;font-weight:700;text-align:right;">${escapeHtml(row.value)}</td>
        </tr>`
    )
    .join("");
  const action = input.actionUrl
    ? `<p style="margin:24px 0;"><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;border-radius:8px;background:#0f766e;color:white;font-size:14px;font-weight:700;padding:12px 16px;text-decoration:none;">${escapeHtml(input.actionLabel ?? "Openen")}</a></p>`
    : "";
  const html = `<!doctype html>
<html lang="nl">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(input.subject)}</title>
  </head>
  <body style="margin:0;background:#f8fafc;color:#0f172a;font-family:Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(input.preheader)}</div>
    <main style="max-width:600px;margin:0 auto;padding:32px 20px;">
      <section style="border:1px solid #e2e8f0;border-radius:12px;background:white;padding:28px;">
        <p style="margin:0 0 8px;color:#0f766e;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">${escapeHtml(input.organizationName)}</p>
        <h1 style="margin:0;color:#0f172a;font-size:24px;line-height:1.25;">${escapeHtml(input.title)}</h1>
        <p style="margin:16px 0 0;color:#334155;font-size:15px;line-height:1.6;">${escapeHtml(input.message)}</p>
        ${action}
        ${htmlRows ? `<table style="width:100%;border-collapse:collapse;margin-top:20px;border-top:1px solid #e2e8f0;">${htmlRows}</table>` : ""}
      </section>
      <p style="margin:16px 4px 0;color:#64748b;font-size:12px;line-height:1.5;">Deze mail is automatisch verstuurd door ${escapeHtml(input.organizationName)}.</p>
    </main>
  </body>
</html>`;

  return {
    html,
    subject: input.subject,
    text
  };
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
