import { BrandingForm } from "@/components/admin/branding-form";
import { PortalThemePreview } from "@/components/platform/portal-theme-preview";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/ui";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
import { selectTenantPortalThemeAction } from "@/lib/domain/portal-theme-control-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getThemeDisplayName,
  portalThemeCatalog
} from "@/lib/theme/portal-theme-registry";

export const dynamic = "force-dynamic";

export default async function BrandingPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await requirePrivateShellContext("/admin/branding"); const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const [branding, availability, assignment, nationalLicense, params] = await Promise.all([
    admin.from("tenant_branding").select("product_name, logo_url, primary_color, accent_color, email_from_name, email_footer, portal_welcome, pwa_enabled, status").eq("tenant_id", tenant.id).maybeSingle(),
    admin.from("tenant_portal_theme_availability").select("theme_key, theme_release, is_enabled").eq("tenant_id", tenant.id).eq("is_enabled", true),
    admin.from("tenant_portal_theme_assignment").select("theme_key, theme_release").eq("tenant_id", tenant.id).is("deactivated_at", null).maybeSingle(),
    admin.from("tenant_portal_theme_license").select("status, expires_at").eq("tenant_id", tenant.id).eq("theme_key", "nationaal-zwem-abc").maybeSingle(),
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)
  ]);
  for (const [label, result] of [["branding", branding], ["theme availability", availability], ["theme assignment", assignment], ["theme license", nationalLicense]] as const) {
    if (result.error) throw new Error(`Could not load ${label}: ${result.error.message}`);
  }
  const row = branding.data as null | Record<string, string | boolean | null>;
  const initial = { productName: String(row?.product_name ?? ""), logoUrl: String(row?.logo_url ?? ""), primaryColor: String(row?.primary_color ?? "#1d4ed8"), accentColor: String(row?.accent_color ?? "#06b6d4"), emailFromName: String(row?.email_from_name ?? ""), emailFooter: String(row?.email_footer ?? ""), portalWelcome: String(row?.portal_welcome ?? ""), pwaEnabled: Boolean(row?.pwa_enabled), status: String(row?.status ?? "draft") };
  const errorCode = getParam(params, "error");
  const enabledReleases = new Set(
    (availability.data ?? []).map((item) => `${item.theme_key}@${item.theme_release}`)
  );
  const selectableThemes = portalThemeCatalog.filter((theme) =>
    enabledReleases.has(`${theme.theme.key}@${theme.theme.release}`)
  );
  const activeThemeKey = assignment.data
    ? `${assignment.data.theme_key}@${assignment.data.theme_release}`
    : "nxttrack-default@3.0.0";
  const licenseVerified = nationalLicense.data?.status === "verified"
    && (!nationalLicense.data.expires_at || new Date(nationalLicense.data.expires_at) > new Date());
  const saved = getParam(params, "saved");

  return (
    <div className="space-y-6">
      <PageHeader kicker="White-label premium" title="Branding & PWA" subtitle="Beheer tenantnaam, kleuren, portaalcopy, e-mailstijl en het ouderportaalthema." />
      {saved ? <p className="rounded-xl border border-success/20 bg-success/10 px-3 py-2 text-sm font-semibold text-success">{saved === "theme" ? "Ouderportaalthema opgeslagen." : "Branding opgeslagen en actief voor portaal en transactionele e-mail."}</p> : null}
      {errorCode ? <p className="rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{errorCode === "logo" ? "Gebruik voor het logo een volledige, veilige https-URL." : errorCode === "theme" ? "Dit thema is niet beschikbaar of kon niet veilig worden geactiveerd." : "Branding opslaan is niet gelukt."}</p> : null}

      <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Ouderportaal</p>
          <h2 className="mt-1 text-xl font-bold">Kies een beschikbaar thema</h2>
          <p className="mt-1 text-sm text-muted-foreground">Platformbeheer bepaalt de catalogus. Je keuze gebruikt overal dezelfde routes, functies en gegevens.</p>
        </div>
        {selectableThemes.length ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {selectableThemes.map((theme) => {
              const releaseKey = `${theme.theme.key}@${theme.theme.release}`;
              const active = releaseKey === activeThemeKey;
              return (
                <article className={`overflow-hidden rounded-2xl border bg-background ${active ? "border-primary ring-2 ring-primary/20" : "border-border"}`} data-theme-choice={theme.theme.key} key={releaseKey}>
                  <PortalThemePreview compact manifest={theme} />
                  <form action={selectTenantPortalThemeAction} className="grid gap-3 p-4">
                    <input name="themeRelease" type="hidden" value={releaseKey} />
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-bold">{getThemeDisplayName(theme, licenseVerified)}</h3>
                        {active ? <span className="rounded-full bg-success/10 px-2 py-1 text-xs font-bold text-success">Actief</span> : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{theme.theme.description}</p>
                    </div>
                    <input
                      className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
                      defaultValue={`Themakeuze door organisatiebeheer: ${getThemeDisplayName(theme, licenseVerified)}`}
                      maxLength={1000}
                      name="reason"
                      required
                    />
                    <Button disabled={active} type="submit">{active ? "Huidig thema" : "Dit thema gebruiken"}</Button>
                  </form>
                </article>
              );
            })}
          </div>
        ) : <p className="mt-5 rounded-xl border border-warning/25 bg-warning/10 p-4 text-sm font-semibold text-warning">Platformbeheer heeft nog geen thema beschikbaar gesteld.</p>}
      </section>

      <BrandingForm initial={initial} tenantName={tenant.name} />
    </div>
  );
}
function getParam(params: Record<string, string | string[] | undefined>, key: string) { const value = params[key]; return Array.isArray(value) ? value[0] : value; }
