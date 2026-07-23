import { BrandingForm } from "@/components/admin/branding-form";
import { PageHeader } from "@/components/shell/ui";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function BrandingPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await requirePrivateShellContext("/admin/branding"); const tenant = getActiveTenant(context);
  const { data, error } = await createAdminClient().from("tenant_branding").select("product_name, logo_url, primary_color, accent_color, email_from_name, email_footer, portal_welcome, pwa_enabled, status").eq("tenant_id", tenant.id).maybeSingle();
  if (error) throw new Error(`Could not load branding: ${error.message}`);
  const row = data as null | Record<string, string | boolean | null>; const params = (await searchParams) ?? {};
  const initial = { productName: String(row?.product_name ?? ""), logoUrl: String(row?.logo_url ?? ""), primaryColor: String(row?.primary_color ?? "#1d4ed8"), accentColor: String(row?.accent_color ?? "#06b6d4"), emailFromName: String(row?.email_from_name ?? ""), emailFooter: String(row?.email_footer ?? ""), portalWelcome: String(row?.portal_welcome ?? ""), pwaEnabled: Boolean(row?.pwa_enabled), status: String(row?.status ?? "draft") };
  return <div className="space-y-6"><PageHeader kicker="White-label premium" title="Branding & PWA" subtitle="Beheer tenantnaam, kleuren, portaalcopy en e-mailstijl met directe preview." />{getParam(params, "saved") ? <p className="rounded-xl border border-success/20 bg-success/10 px-3 py-2 text-sm font-semibold text-success">Branding opgeslagen.</p> : null}{getParam(params, "error") ? <p className="rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">Branding opslaan is niet gelukt.</p> : null}<BrandingForm initial={initial} tenantName={tenant.name} /></div>;
}
function getParam(params: Record<string, string | string[] | undefined>, key: string) { const value = params[key]; return Array.isArray(value) ? value[0] : value; }
