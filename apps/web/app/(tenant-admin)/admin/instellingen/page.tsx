import { AdminListSurface } from "@/components/admin/admin-patterns";
import { Field, SubmitButton } from "@/components/admin/domain-ui";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { DirtyForm } from "@/components/ui/dirty-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
import { saveTenantSettingsAction } from "@/lib/domain/tenant-settings-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ReactNode } from "react";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type TenantSettingsRow = {
  analytics_enabled: boolean | null;
  google_analytics_measurement_id: string | null;
  lesson_cancellation_credit_window_days: number | null;
  lesson_cancellation_cutoff_hours: number | null;
  lesson_cancellation_grants_credit: boolean | null;
  locale: string | null;
  terminology_sector: string | null;
  timezone: string | null;
};

const sectorOptions = [
  { label: "Zwemschool", value: "swim_school" },
  { label: "Voetbalschool", value: "football_school" },
  { label: "Sportclub", value: "sports_club" },
  { label: "Vechtsportschool", value: "martial_arts_school" },
  { label: "Dansschool", value: "dance_school" },
  { label: "Algemene lessenorganisatie", value: "generic_lessons" }
];

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const saved = getParam(params, "saved") === "1";
  const error = getParam(params, "error");
  const context = await requirePrivateShellContext("/admin/instellingen");
  const tenant = getActiveTenant(context);
  const settings = await loadSettings(tenant.id);
  const canManage = context.activeTenant?.roles.some((role) => role === "tenant_owner" || role === "tenant_admin") ?? false;

  return (
    <div className="space-y-5">
      <PageHeader kicker="Beheer" subtitle={`Beheer configuratie, beleid, analytics en privacy voor ${tenant.name}.`} title="Instellingen" />

      {saved ? <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-medium text-success">Instellingen zijn opgeslagen.</p> : null}
      {error ? <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{errorMessage(error)}</p> : null}

      <AdminListSurface>
        <DirtyForm action={saveTenantSettingsAction} className="grid gap-5">
          <Tabs defaultValue="general">
            <TabsList className="justify-start">
              <TabsTrigger className="flex-none" value="general">Algemeen</TabsTrigger>
              <TabsTrigger className="flex-none" value="terminology">Terminologie</TabsTrigger>
              <TabsTrigger className="flex-none" value="cancellation">Annuleren & inhalen</TabsTrigger>
              <TabsTrigger className="flex-none" value="analytics">Analytics</TabsTrigger>
              <TabsTrigger className="flex-none" value="notifications">Notificaties</TabsTrigger>
              <TabsTrigger className="flex-none" value="privacy">Privacy & cookies</TabsTrigger>
              <TabsTrigger className="flex-none" value="product">Productisatie</TabsTrigger>
            </TabsList>

            <TabsContent forceMount value="general">
              <SettingsPanel description="Basisgegevens voor taal, planning en tijdnotatie." title="Algemeen">
                <div className="grid gap-4 md:grid-cols-2">
                  <ReadOnlyField label="Organisatie" value={tenant.name} />
                  <ReadOnlyField label="Slug" value={tenant.slug} />
                  <Field defaultValue={settings.locale} label="Locale" name="locale" required />
                  <Field defaultValue={settings.timezone} label="Tijdzone" name="timezone" required />
                </div>
              </SettingsPanel>
            </TabsContent>

            <TabsContent forceMount value="terminology">
              <SettingsPanel description="Sector templates bepalen consistente termen in backoffice en portalen." title="Sector en terminologie">
                <label className="grid max-w-xl gap-1.5 text-[13px] font-semibold text-foreground">
                  Sector
                  <select className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring" defaultValue={settings.terminology_sector} disabled={!canManage} name="terminologySector">
                    {sectorOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              </SettingsPanel>
            </TabsContent>

            <TabsContent forceMount value="cancellation">
              <SettingsPanel action={<StatusPill tone={settings.lesson_cancellation_grants_credit ? "success" : "warning"}>{settings.lesson_cancellation_grants_credit ? "Credits actief" : "Geen automatische credits"}</StatusPill>} description="Beleid voor annuleringen en inhaalcredits in het ouderportaal." title="Annuleren en inhalen">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field defaultValue={settings.lesson_cancellation_cutoff_hours} label="Annuleren tot aantal uur vooraf" name="lessonCancellationCutoffHours" type="number" />
                  <Field defaultValue={settings.lesson_cancellation_credit_window_days} label="Credit geldig in dagen" name="lessonCancellationCreditWindowDays" type="number" />
                  <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 text-[13px] font-semibold text-foreground md:col-span-2"><input className="size-4 rounded border-border" defaultChecked={settings.lesson_cancellation_grants_credit} disabled={!canManage} name="lessonCancellationGrantsCredit" type="checkbox" />Tijdige annulering geeft automatisch een inhaalcredit</label>
                </div>
              </SettingsPanel>
            </TabsContent>

            <TabsContent forceMount value="analytics">
              <SettingsPanel action={<StatusPill tone={settings.analytics_enabled ? "success" : "neutral"}>{settings.analytics_enabled ? "Analytics actief" : "Uitgeschakeld"}</StatusPill>} description="Privacy-first GA4 voor publieke bezoeken; leadherkomst blijft ook first-party beschikbaar." title="Google Analytics 4">
                <div className="grid max-w-2xl gap-4">
                  <Field defaultValue={settings.google_analytics_measurement_id ?? ""} label="GA4-meet-ID" name="googleAnalyticsMeasurementId" placeholder="G-XXXXXXXXXX" />
                  <label className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-3 text-[13px] font-semibold text-foreground"><input className="mt-0.5 size-4 rounded border-border" defaultChecked={settings.analytics_enabled} disabled={!canManage} name="analyticsEnabled" type="checkbox" /><span>Analytics inschakelen na toestemming<span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">De Google-tag wordt pas na consent geladen. Deel nooit persoonsgegevens via campagneparameters.</span></span></label>
                </div>
              </SettingsPanel>
            </TabsContent>

            <TabsContent forceMount value="notifications"><SettingsPanel description="Afzenders en platformbrede mailprovider worden centraal beheerd." title="Notificaties"><p className="text-[13px] text-muted-foreground">Organisatiespecifieke templates en notificatievoorkeuren volgen via de communicatie-instellingen.</p></SettingsPanel></TabsContent>
            <TabsContent forceMount value="privacy"><SettingsPanel description="Publieke analytics blijft consent-gestuurd; gevoelige gegevens blijven buiten trackingparameters." title="Privacy en cookies"><p className="text-[13px] text-muted-foreground">Controleer privacyverklaring, bewaartermijnen en cookiebeleid bij iedere productierelease.</p></SettingsPanel></TabsContent>
            <TabsContent forceMount value="product"><SettingsPanel description="Compact overzicht van resterende commerciële uitbreidingen." title="Productisatie checklist"><ul className="grid gap-2 text-[13px] text-muted-foreground sm:grid-cols-2"><li className="rounded-lg bg-muted px-3 py-2">Logo en publieke branding per organisatie</li><li className="rounded-lg bg-muted px-3 py-2">CRM-pijplijn en opvolgtaken</li><li className="rounded-lg bg-muted px-3 py-2">Document- en diplomabestanden</li><li className="rounded-lg bg-muted px-3 py-2">Organisatiespecifieke mailtemplates</li></ul></SettingsPanel></TabsContent>
          </Tabs>

          {canManage ? <div className="sticky bottom-3 flex justify-end rounded-xl border border-border bg-card/95 p-3 shadow-card backdrop-blur"><SubmitButton>Instellingen opslaan</SubmitButton></div> : <p className="text-sm font-medium text-muted-foreground">Alleen organisatiebeheerders kunnen instellingen wijzigen.</p>}
        </DirtyForm>
      </AdminListSurface>
    </div>
  );
}

async function loadSettings(tenantId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tenant_settings")
    .select("terminology_sector, locale, timezone, lesson_cancellation_cutoff_hours, lesson_cancellation_credit_window_days, lesson_cancellation_grants_credit, analytics_enabled, google_analytics_measurement_id")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load organization settings: ${error.message}`);
  }

  const row = (data as TenantSettingsRow | null) ?? null;

  return {
    analytics_enabled: row?.analytics_enabled ?? false,
    google_analytics_measurement_id: row?.google_analytics_measurement_id ?? null,
    lesson_cancellation_credit_window_days: row?.lesson_cancellation_credit_window_days ?? 60,
    lesson_cancellation_cutoff_hours: row?.lesson_cancellation_cutoff_hours ?? 12,
    lesson_cancellation_grants_credit: row?.lesson_cancellation_grants_credit ?? true,
    locale: row?.locale ?? "nl-NL",
    terminology_sector: row?.terminology_sector ?? "swim_school",
    timezone: row?.timezone ?? "Europe/Amsterdam"
  };
}

function SettingsPanel({ action, children, description, title }: { action?: ReactNode; children: ReactNode; description: string; title: string }) {
  return (
    <section className="max-w-4xl rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-base font-bold text-foreground">{title}</h2><p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{description}</p></div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2 text-sm font-semibold text-foreground">
      <span>{label}</span>
      <p className="flex h-10 items-center rounded-lg border border-border bg-muted px-3 text-sm font-normal text-muted-foreground">{value}</p>
    </div>
  );
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}

function errorMessage(error: string) {
  const messages: Record<string, string> = {
    forbidden: "Je hebt geen rechten om deze instellingen te wijzigen.",
    analytics_id: "Vul een geldig GA4-meet-ID in, bijvoorbeeld G-XXXXXXXXXX, of schakel analytics uit.",
    save_failed: "Instellingen opslaan is niet gelukt."
  };

  return messages[error] ?? "Instellingen verwerken is niet gelukt.";
}
