import Link from "next/link";
import type { ReactNode } from "react";

import { AdminListSurface } from "@/components/admin/admin-patterns";
import { Field, SubmitButton } from "@/components/admin/domain-ui";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { DirtyForm } from "@/components/ui/dirty-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
import { configureChildPortalRolloutAction } from "@/lib/domain/portal-feature-actions";
import { saveTenantBillingProfileAction, saveTenantSettingsAction } from "@/lib/domain/tenant-settings-actions";
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

type TenantBillingProfileRow = {
  address_line_1: string | null;
  address_line_2: string | null;
  billing_email: string | null;
  chamber_of_commerce_number: string | null;
  city: string | null;
  country_code: string;
  credit_note_prefix: string;
  default_vat_rate_basis_points: number;
  iban: string | null;
  invoice_prefix: string;
  legal_name: string;
  payment_terms_days: number;
  phone: string | null;
  postal_code: string | null;
  trade_name: string | null;
  vat_number: string | null;
  vat_scheme: string;
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
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");
  const context = await requirePrivateShellContext("/admin/instellingen");
  const tenant = getActiveTenant(context);
  const [settings, billingProfile, childPortalRollout] = await Promise.all([
    loadSettings(tenant.id),
    loadBillingProfile(tenant.id, tenant.name),
    loadChildPortalRollout(tenant.id)
  ]);
  const canManage = context.activeTenant?.roles.some((role) => role === "tenant_owner" || role === "tenant_admin") ?? false;

  return (
    <div className="space-y-5">
      <PageHeader kicker="Beheer" subtitle={`Beheer configuratie, beleid, analytics en privacy voor ${tenant.name}.`} title="Instellingen" />

      {saved ? <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-medium text-success">{saved === "billing" ? "Bedrijfs- en btw-gegevens zijn opgeslagen." : saved === "child_portal" ? "Kinderportaalrollout is veilig opgeslagen." : "Instellingen zijn opgeslagen."}</p> : null}
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

            <TabsContent forceMount value="notifications">
              <SettingsPanel
                action={<StatusPill tone="warning">WhatsApp/SMS niet gekoppeld</StatusPill>}
                description="Afzenders en de platformbrede e-mailprovider worden centraal beheerd."
                title="Notificaties en automation"
              >
                <div className="grid gap-3 text-[13px] leading-5">
                  <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-muted-foreground">
                    E-mail gebruikt de centrale platformprovider. Organisatiespecifieke templates en voorkeuren volgen via de communicatie-instellingen.
                  </p>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-amber-950">
                    <p className="font-bold">WhatsApp en SMS zijn bewust uitgeschakeld</p>
                    <p className="mt-1">
                      Er is nog geen provider, consentregistratie of delivery-audit voor deze kanalen. Automation recipes maken daarom uitsluitend interne controletaken.
                    </p>
                  </div>
                  <Link
                    className="inline-flex min-h-11 w-fit items-center rounded-lg border border-border bg-background px-4 font-bold text-foreground hover:bg-muted"
                    href="/admin/automatisering"
                  >
                    Open veilige recipegallery
                  </Link>
                </div>
              </SettingsPanel>
            </TabsContent>
            <TabsContent forceMount value="privacy"><SettingsPanel description="Publieke analytics blijft consent-gestuurd; gevoelige gegevens blijven buiten trackingparameters." title="Privacy en cookies"><p className="text-[13px] text-muted-foreground">Controleer privacyverklaring, bewaartermijnen en cookiebeleid bij iedere productierelease.</p></SettingsPanel></TabsContent>
            <TabsContent forceMount value="product"><SettingsPanel description="Compact overzicht van resterende commerciële uitbreidingen." title="Productisatie checklist"><ul className="grid gap-2 text-[13px] text-muted-foreground sm:grid-cols-2"><li className="rounded-lg bg-muted px-3 py-2">Logo en publieke branding per organisatie</li><li className="rounded-lg bg-muted px-3 py-2">CRM-pijplijn en opvolgtaken</li><li className="rounded-lg bg-muted px-3 py-2">Document- en diplomabestanden</li><li className="rounded-lg bg-muted px-3 py-2">Organisatiespecifieke mailtemplates</li></ul></SettingsPanel></TabsContent>
          </Tabs>

          {canManage ? <div className="sticky bottom-3 flex justify-end rounded-xl border border-border bg-card/95 p-3 shadow-card backdrop-blur"><SubmitButton>Instellingen opslaan</SubmitButton></div> : <p className="text-sm font-medium text-muted-foreground">Alleen organisatiebeheerders kunnen instellingen wijzigen.</p>}
        </DirtyForm>
      </AdminListSurface>

      <AdminListSurface>
        <DirtyForm action={configureChildPortalRolloutAction} className="grid gap-5">
          <SettingsPanel
            action={<StatusPill tone={["pilot", "enabled"].includes(childPortalRollout.status) ? "success" : childPortalRollout.status === "paused" ? "warning" : "neutral"}>{childPortalRollout.status}</StatusPill>}
            description="Tenantgewijze rollout met een directe kill switch. Uitschakelen of pauzeren vergrendelt bestaande kindsessies; terugkeer vereist daarna opnieuw inloggen. Directe kindlogin blijft in v1 altijd uit."
            title="Ouder- en kinderportaal"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1.5 text-[13px] font-semibold text-foreground">Rolloutstatus<select className="h-10 rounded-lg border border-border bg-background px-3 text-sm font-normal" defaultValue={childPortalRollout.status} disabled={!canManage} name="childPortalStatus"><option value="disabled">Uitgeschakeld</option><option value="pilot">Pilot</option><option value="enabled">Ingeschakeld</option><option value="paused">Gepauzeerd / kill switch</option></select></label>
              <Field defaultValue={childPortalRollout.absoluteTtlMinutes} description="15–720 minuten; daarna valt de sessie fail-closed dicht." label="Absolute kindmodustijd in minuten" min={15} name="childPortalTtlMinutes" type="number" />
              <label className="flex min-h-12 items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-3 text-[13px] font-semibold"><input className="mt-0.5 size-4" defaultChecked={childPortalRollout.securityReviewed} disabled={!canManage} name="childPortalSecurityReviewed" type="checkbox" /><span>Securitymatrix beoordeeld<span className="mt-1 block text-xs font-normal text-muted-foreground">Verplicht voor pilot/aan.</span></span></label>
              <label className="flex min-h-12 items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-3 text-[13px] font-semibold"><input className="mt-0.5 size-4" defaultChecked={childPortalRollout.visualMatrixReviewed} disabled={!canManage} name="childPortalVisualReviewed" type="checkbox" /><span>Visuele matrix beoordeeld<span className="mt-1 block text-xs font-normal text-muted-foreground">Verplicht voor pilot/aan.</span></span></label>
              <ReadOnlyField label="Directe kindlogin" value="Uitgeschakeld (v1)" />
              <ReadOnlyField label="Capabilities" value="Exact 8 child-safe rechten" />
            </div>
          </SettingsPanel>
          {canManage ? <div className="flex justify-end"><SubmitButton>Rollout opslaan</SubmitButton></div> : null}
        </DirtyForm>
      </AdminListSurface>

      <AdminListSurface>
        <DirtyForm action={saveTenantBillingProfileAction} className="grid gap-5">
          <SettingsPanel
            action={<StatusPill tone={billingProfile.complete ? "success" : "warning"}>{billingProfile.complete ? "Facturatie gereed" : "Aanvullen vereist"}</StatusPill>}
            description="Deze gegevens worden bij uitgifte vastgelegd op de definitieve factuur of creditnota. Prijzen zijn inclusief btw; 21% is de standaard."
            title="Bedrijfsgegevens, facturen en btw"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field defaultValue={billingProfile.legal_name} label="Juridische naam" name="legalName" required />
              <Field defaultValue={billingProfile.trade_name ?? ""} label="Handelsnaam" name="tradeName" />
              <Field defaultValue={billingProfile.address_line_1 ?? ""} label="Adres" name="addressLine1" required />
              <Field defaultValue={billingProfile.address_line_2 ?? ""} label="Adresregel 2" name="addressLine2" />
              <Field defaultValue={billingProfile.postal_code ?? ""} label="Postcode" name="postalCode" required />
              <Field defaultValue={billingProfile.city ?? ""} label="Plaats" name="city" required />
              <Field defaultValue={billingProfile.country_code} label="Landcode" name="countryCode" required />
              <Field defaultValue={billingProfile.billing_email ?? ""} label="Facturatie-e-mail" name="billingEmail" required type="email" />
              <Field defaultValue={billingProfile.chamber_of_commerce_number ?? ""} label="KvK-nummer" name="chamberOfCommerceNumber" />
              <Field defaultValue={billingProfile.vat_number ?? ""} label="Btw-nummer" name="vatNumber" />
              <Field defaultValue={billingProfile.iban ?? ""} label="IBAN" name="iban" />
              <Field defaultValue={billingProfile.phone ?? ""} label="Telefoon" name="billingPhone" />
              <label className="grid gap-1.5 text-[13px] font-semibold text-foreground">
                Btw-regeling
                <select className="h-10 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring" defaultValue={billingProfile.vat_scheme} disabled={!canManage} name="vatScheme">
                  <option value="standard">Standaard btw</option>
                  <option value="exempt">Vrijgesteld</option>
                  <option value="small_business">Kleineondernemersregeling</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-[13px] font-semibold text-foreground">
                Standaard btw-tarief
                <select className="h-10 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring" defaultValue={String(billingProfile.default_vat_rate_basis_points)} disabled={!canManage} name="defaultVatRateBasisPoints">
                  <option value="2100">21%</option>
                  <option value="900">9%</option>
                  <option value="0">0%</option>
                </select>
              </label>
              <Field defaultValue={billingProfile.invoice_prefix} label="Factuurprefix" name="invoicePrefix" required />
              <Field defaultValue={billingProfile.credit_note_prefix} label="Creditnotaprefix" name="creditNotePrefix" required />
              <Field defaultValue={billingProfile.payment_terms_days} label="Betaaltermijn in dagen" name="paymentTermsDays" type="number" />
              <ReadOnlyField label="Prijsmodel" value="Consumentenprijs inclusief btw" />
            </div>
          </SettingsPanel>
          {canManage ? <div className="sticky bottom-3 flex justify-end rounded-xl border border-border bg-card/95 p-3 shadow-card backdrop-blur"><SubmitButton>Factuurprofiel opslaan</SubmitButton></div> : null}
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

async function loadBillingProfile(tenantId: string, tenantName: string) {
  const { data, error } = await createAdminClient()
    .from("tenant_billing_profiles")
    .select("legal_name, trade_name, address_line_1, address_line_2, postal_code, city, country_code, chamber_of_commerce_number, vat_number, iban, billing_email, phone, vat_scheme, default_vat_rate_basis_points, invoice_prefix, credit_note_prefix, payment_terms_days")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load billing profile: ${error.message}`);
  }

  const row = data as TenantBillingProfileRow | null;
  const profile = row ?? {
    address_line_1: null,
    address_line_2: null,
    billing_email: null,
    chamber_of_commerce_number: null,
    city: null,
    country_code: "NL",
    credit_note_prefix: "CN",
    default_vat_rate_basis_points: 2100,
    iban: null,
    invoice_prefix: "INV",
    legal_name: tenantName,
    payment_terms_days: 14,
    phone: null,
    postal_code: null,
    trade_name: null,
    vat_number: null,
    vat_scheme: "standard"
  };

  return {
    ...profile,
    complete: Boolean(profile.address_line_1 && profile.postal_code && profile.city && profile.billing_email)
  };
}

async function loadChildPortalRollout(tenantId: string) {
  const { data, error } = await createAdminClient()
    .from("tenant_swim_rollouts")
    .select("feature_key, status, readiness_json, config_json")
    .eq("tenant_id", tenantId)
    .in("feature_key", ["swim.portal.child_mode", "swim.portal.direct_child_login"]);
  if (error) throw new Error(`Could not load child portal rollout: ${error.message}`);
  const childMode = (data ?? []).find((row) => row.feature_key === "swim.portal.child_mode");
  const readiness = asObject(childMode?.readiness_json);
  const config = asObject(childMode?.config_json);
  const ttl = Number(config.absoluteTtlMinutes);
  return {
    absoluteTtlMinutes: Number.isInteger(ttl) && ttl >= 15 && ttl <= 720 ? ttl : 240,
    securityReviewed: readiness.security_reviewed === true,
    status: ["disabled", "paused", "pilot", "enabled"].includes(childMode?.status ?? "") ? childMode!.status : "disabled",
    visualMatrixReviewed: readiness.visual_matrix_reviewed === true
  };
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
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
    billing_profile: "Vul de verplichte bedrijfs- en facturatiegegevens correct in.",
    billing_profile_save: "Het factuurprofiel kon niet worden opgeslagen.",
    child_portal_config: "De kinderportaalrollout kon niet veilig worden opgeslagen.",
    child_portal_permission: "Alleen een organisatie-eigenaar of -beheerder mag de kinderportaalrollout wijzigen.",
    child_portal_readiness: "Pilot of inschakelen vereist een afgeronde security- én visuele beoordeling.",
    save_failed: "Instellingen opslaan is niet gelukt."
  };

  return messages[error] ?? "Instellingen verwerken is niet gelukt.";
}
