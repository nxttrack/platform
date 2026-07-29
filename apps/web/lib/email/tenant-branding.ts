export type TenantEmailBranding = {
  accentColor: string;
  footer: string | null;
  fromName: string | null;
  logoUrl: string | null;
  primaryColor: string;
  productName: string | null;
};

export function applyTenantEmailBranding(
  input: { html?: string; organizationName?: string | null; text: string },
  branding: TenantEmailBranding
) {
  const organizationName = branding.productName ?? input.organizationName ?? null;
  const safeLogoUrl = normalizeTenantLogoUrl(branding.logoUrl);
  const footer = branding.footer?.trim().slice(0, 500) || null;
  const html = input.html
    ? applyHtmlBranding(input.html, {
        accentColor: normalizeColor(branding.accentColor, "#06b6d4"),
        footer,
        logoUrl: safeLogoUrl,
        primaryColor: normalizeColor(branding.primaryColor, "#0f766e")
      })
    : undefined;
  const text = footer ? `${input.text.trim()}\n\n${footer}` : input.text;

  return { html, organizationName, text };
}

export function normalizeTenantLogoUrl(value: string | null | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function applyHtmlBranding(
  source: string,
  branding: { accentColor: string; footer: string | null; logoUrl: string | null; primaryColor: string }
) {
  let html = source
    .replaceAll("#0f766e", branding.primaryColor)
    .replaceAll("#06b6d4", branding.accentColor);

  if (branding.logoUrl) {
    const logo = `<img alt="" src="${escapeHtmlAttribute(branding.logoUrl)}" style="display:block;max-height:48px;max-width:180px;margin:0 0 18px;object-fit:contain;" />`;
    html = html.replace(/(<section\b[^>]*>)/i, `$1${logo}`);
  }

  if (branding.footer) {
    const footer = `<p style="margin:12px 4px 0;color:#64748b;font-size:12px;line-height:1.5;">${escapeHtml(branding.footer)}</p>`;
    html = html.replace("</main>", `${footer}</main>`);
  }

  return html;
}

function normalizeColor(value: string, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeHtmlAttribute(value: string) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
