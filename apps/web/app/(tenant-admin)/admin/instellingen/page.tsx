import { AdminSection, Field, SubmitButton } from "@/components/admin/domain-ui";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
import { saveTenantSettingsAction } from "@/lib/domain/tenant-settings-actions";
import { createAdminClient } from "@/lib/supabase/admin";

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
    <div className="space-y-6">
      <PageHeader kicker="Organisatie" subtitle={`Beheer basisinstellingen en ouderportaalbeleid voor ${tenant.name}.`} title="Instellingen" />

      {saved ? <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-medium text-success">Instellingen zijn opgeslagen.</p> : null}
      {error ? <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{errorMessage(error)}</p> : null}

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <AdminSection description="Deze gegevens sturen labels, taal, tijdzone en toekomstige sector-template keuzes." title="Basis">
          <form action={saveTenantSettingsAction} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <ReadOnlyField label="Organisatie" value={tenant.name} />
              <ReadOnlyField label="Slug" value={tenant.slug} />
              <label className="space-y-2 text-sm font-semibold text-foreground">
                <span>Sector en terminologie</span>
                <select
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm font-normal outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  defaultValue={settings.terminology_sector}
                  disabled={!canManage}
                  name="terminologySector"
                >
                  {sectorOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <Field defaultValue={settings.locale} label="Locale" name="locale" required />
              <Field defaultValue={settings.timezone} label="Tijdzone" name="timezone" required />
            </div>

            <div className="rounded-lg border border-border bg-white p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-foreground">Annuleren en inhalen</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Deze policy wordt gebruikt in het ouderportaal bij lesannuleringen en inhaalcredits.</p>
                </div>
                <StatusPill tone={settings.lesson_cancellation_grants_credit ? "success" : "warning"}>
                  {settings.lesson_cancellation_grants_credit ? "credits actief" : "geen automatische credits"}
                </StatusPill>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field defaultValue={settings.lesson_cancellation_cutoff_hours} label="Annuleren tot aantal uur vooraf" name="lessonCancellationCutoffHours" type="number" />
                <Field defaultValue={settings.lesson_cancellation_credit_window_days} label="Credit geldig in dagen" name="lessonCancellationCreditWindowDays" type="number" />
                <label className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-semibold text-foreground md:col-span-2">
                  <input className="size-4 rounded border-border" defaultChecked={settings.lesson_cancellation_grants_credit} disabled={!canManage} name="lessonCancellationGrantsCredit" type="checkbox" />
                  Tijdige annulering geeft automatisch een inhaalcredit
                </label>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-white p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-foreground">Google Analytics 4</h2>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                    Meet alleen publieke websitebezoeken na expliciete toestemming. Leadherkomst wordt daarnaast first-party in NXTTRACK opgeslagen.
                  </p>
                </div>
                <StatusPill tone={settings.analytics_enabled ? "success" : "neutral"}>
                  {settings.analytics_enabled ? "analytics actief" : "uitgeschakeld"}
                </StatusPill>
              </div>
              <div className="grid gap-4">
                <Field
                  defaultValue={settings.google_analytics_measurement_id ?? ""}
                  label="GA4-meet-ID"
                  name="googleAnalyticsMeasurementId"
                  placeholder="G-XXXXXXXXXX"
                />
                <label className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-3 text-sm font-semibold text-foreground">
                  <input
                    className="mt-0.5 size-4 rounded border-border"
                    defaultChecked={settings.analytics_enabled}
                    disabled={!canManage}
                    name="analyticsEnabled"
                    type="checkbox"
                  />
                  <span>
                    Analytics inschakelen op de publieke organisatiesite
                    <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">
                      De Google-tag wordt pas geladen nadat de bezoeker analytics toestaat. Deel nooit namen, e-mailadressen of kindgegevens via campagneparameters.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            {canManage ? <SubmitButton>Instellingen opslaan</SubmitButton> : <p className="text-sm font-medium text-muted-foreground">Alleen organisatiebeheerders kunnen instellingen wijzigen.</p>}
          </form>
        </AdminSection>

        <AdminSection description="Deze punten horen bij de volgende productization-subtaken." title="Nog te productiseren">
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="rounded-lg bg-muted px-3 py-2">Logo en publieke branding per organisatie.</li>
            <li className="rounded-lg bg-muted px-3 py-2">Volwaardige CRM-pijplijn met eigenaar, opvolgtaak en verloren-redenen.</li>
            <li className="rounded-lg bg-muted px-3 py-2">Document- en diplomabestanden via private storage.</li>
            <li className="rounded-lg bg-muted px-3 py-2">Mailtemplates en afzender per organisatie waar passend.</li>
          </ul>
        </AdminSection>
      </div>
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
