import { ExternalLink, FileText, Globe2, Image, Palette, Settings, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Card, PageHeader, StatusPill } from "@/components/shell/ui";
import { updateTenantPublicProfileAction, upsertIntakeFormConfigAction, upsertProgramPublicSettingsAction } from "@/lib/tenant-website-settings/admin-tenant-website-actions";
import type {
  AdminTenantWebsiteSettingsSnapshot,
  IntakeFormConfigSettingsRow,
  ProgramPublicSettingsRow,
  TenantPublicProfileSettingsRow,
  TenantWebsiteProgramRow
} from "@/lib/tenant-website-settings/admin-tenant-website-read-model";

type Props = {
  snapshot: AdminTenantWebsiteSettingsSnapshot;
};

const defaultNewsItems = [
  {
    title: "Nieuwe instroommomenten",
    body: "Gebruik dit blok voor nieuws vanuit de zwemschool.",
    date: "Vandaag"
  }
];

const defaultAgendaItems = [
  {
    title: "Proeflesmoment",
    time: "Zaterdag 11:00",
    location: "Instructiebad"
  }
];

const defaultQuestions = [
  {
    name: "zwemervaring",
    label: "Heeft je kind al zwemervaring?",
    type: "textarea",
    required: false
  }
];

export function AdminTenantWebsiteSettingsPage({ snapshot }: Props) {
  if (snapshot.status !== "ready" || !snapshot.tenant) {
    return <WebsiteSettingsStatus snapshot={snapshot} />;
  }

  const profile = snapshot.data.profile ?? createFallbackProfile(snapshot.tenant.name);
  const settingsByProgram = new Map(snapshot.data.programSettings.map((setting) => [setting.program_id, setting]));
  const intakeByProgram = new Map(snapshot.data.intakeConfigs.map((config) => [config.program_id, config]));
  const publishedPrograms = snapshot.data.programSettings.filter((setting) => setting.status === "published").length;
  const activeIntakes = snapshot.data.intakeConfigs.filter((config) => config.status === "active").length;

  return (
    <div className="grid gap-6">
      <PageHeader
        action={
          <div className="flex flex-wrap gap-2">
            <Link className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted" href="/" target="_blank">
              Website <ExternalLink className="h-4 w-4" />
            </Link>
            <StatusPill tone="success">Beheerbaar</StatusPill>
          </div>
        }
        kicker="Backoffice - instellingen"
        subtitle="Beheer tenantbranding, publieke websitecopy, programma-publicatie en intakeconfiguratie zonder codewijziging."
        title="Tenantwebsite instellingen"
      />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={<Globe2 className="h-5 w-5" />} label="Website status" value={profile.status} detail={snapshot.tenant.slug} />
        <MetricCard icon={<Palette className="h-5 w-5" />} label="Primaire kleur" value={profile.brand_primary_hex} detail={profile.brand_accent_hex} />
        <MetricCard icon={<SlidersHorizontal className="h-5 w-5" />} label="Programma's live" value={`${publishedPrograms}/${snapshot.data.programs.length}`} detail="publieke cards" />
        <MetricCard icon={<FileText className="h-5 w-5" />} label="Intakes actief" value={`${activeIntakes}/${snapshot.data.programs.length}`} detail="per programma" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <SectionHeader icon={<Settings className="h-5 w-5" />} title="Websiteprofiel & branding" />
          <TenantPublicProfileForm profile={profile} tenantName={snapshot.tenant.name} />
        </Card>

        <Card>
          <SectionHeader icon={<Image className="h-5 w-5" />} title="Lovable preview" />
          <TenantWebsitePreview profile={profile} tenantName={snapshot.tenant.name} />
        </Card>
      </div>

      <Card>
        <SectionHeader icon={<Globe2 className="h-5 w-5" />} title="Programma-overzicht & intake" />
        <div className="mt-4 grid gap-4">
          {snapshot.data.programs.length === 0 ? <EmptyState>Maak eerst programma's aan voordat je de publieke website publiceert.</EmptyState> : null}
          {snapshot.data.programs.map((program) => (
            <ProgramWebsiteSettingsCard key={program.id} config={intakeByProgram.get(program.id) ?? null} program={program} setting={settingsByProgram.get(program.id) ?? null} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function TenantPublicProfileForm({ profile, tenantName }: { profile: TenantPublicProfileSettingsRow; tenantName: string }) {
  return (
    <form action={updateTenantPublicProfileAction} className="mt-4 grid gap-5">
      <div className="grid gap-3 md:grid-cols-3">
        <SelectField defaultValue={profile.status} label="Publicatiestatus" name="status" options={["draft", "published", "archived"]} />
        <TextField defaultValue={profile.brand_primary_hex} label="Primaire kleur" name="brand_primary_hex" type="color" />
        <TextField defaultValue={profile.brand_accent_hex} label="Accentkleur" name="brand_accent_hex" type="color" />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <TextField defaultValue={profile.logo_url ?? ""} label="Logo URL/pad" name="logo_url" placeholder="/lovable/zwemdemo-logo.png" />
        <TextField defaultValue={profile.hero_image_url ?? ""} label="Hero afbeelding URL/pad" name="hero_image_url" placeholder="/lovable/hero-swim.png" />
        <TextField defaultValue={profile.hero_image_alt ?? ""} label="Hero alt-tekst" name="hero_image_alt" placeholder="Kind in zwembad" />
        <TextField defaultValue={profile.location_label ?? ""} label="Locatie label" name="location_label" placeholder="Den Haag" />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <TextField defaultValue={profile.hero_title} label="Hero titel" name="hero_title" placeholder={`Zwemles met vertrouwen bij ${tenantName}`} required />
        <TextField defaultValue={profile.hero_subtitle} label="Hero subtitel" name="hero_subtitle" required />
        <TextField defaultValue={profile.primary_cta_label} label="Primaire CTA" name="primary_cta_label" required />
        <TextField defaultValue={profile.secondary_cta_label} label="Secundaire CTA" name="secondary_cta_label" required />
        <TextField defaultValue={profile.intro_title ?? ""} label="Intro titel" name="intro_title" />
        <TextAreaField defaultValue={profile.intro_body ?? ""} label="Intro tekst" name="intro_body" />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <TextField defaultValue={profile.footer_tagline ?? ""} label="Footer slogan" name="footer_tagline" />
        <TextField defaultValue={profile.contact_email ?? ""} label="Contact e-mail" name="contact_email" type="email" />
        <TextField defaultValue={profile.contact_phone ?? ""} label="Telefoon" name="contact_phone" />
        <TextAreaField defaultValue={profile.address_lines.join("\n")} label="Adresregels" name="address_lines" />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <TextField defaultValue={profile.seo_title ?? ""} label="SEO titel" name="seo_title" />
        <TextAreaField defaultValue={profile.seo_description ?? ""} label="SEO omschrijving" name="seo_description" />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <JsonField defaultValue={jsonText(profile.news_items, defaultNewsItems)} label="Nieuwsitems JSON" name="news_items_json" />
        <JsonField defaultValue={jsonText(profile.agenda_items, defaultAgendaItems)} label="Agendamomenten JSON" name="agenda_items_json" />
      </div>

      <div>
        <SubmitButton>Websiteprofiel opslaan</SubmitButton>
      </div>
    </form>
  );
}

function TenantWebsitePreview({ profile, tenantName }: { profile: TenantPublicProfileSettingsRow; tenantName: string }) {
  const logoUrl = profile.logo_url || "/lovable/zwemdemo-logo.png";
  const heroImageUrl = profile.hero_image_url || "/lovable/hero-swim.png";
  const location = profile.location_label || "Locatie nog niet ingevuld";

  return (
    <div className="mt-4 overflow-hidden rounded-3xl border border-border bg-white shadow-soft">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <img alt={tenantName} className="h-5 w-auto" src={logoUrl} />
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">{profile.status}</span>
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-[1fr_0.8fr]">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: profile.brand_primary_hex }}>
            {tenantName} - {location}
          </p>
          <h2 className="mt-2 text-2xl font-bold leading-tight text-navy">{profile.hero_title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{profile.hero_subtitle}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-xl px-4 py-2 text-sm font-bold text-white" style={{ backgroundColor: profile.brand_primary_hex }}>
              {profile.primary_cta_label}
            </span>
            <span className="rounded-xl border border-border bg-white px-4 py-2 text-sm font-bold">{profile.secondary_cta_label}</span>
          </div>
        </div>
        <img alt={profile.hero_image_alt ?? tenantName} className="h-48 w-full rounded-2xl object-cover" src={heroImageUrl} />
      </div>
    </div>
  );
}

function ProgramWebsiteSettingsCard({ program, setting, config }: { program: TenantWebsiteProgramRow; setting: ProgramPublicSettingsRow | null; config: IntakeFormConfigSettingsRow | null }) {
  return (
    <div className="rounded-3xl border border-border bg-muted/35 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">{program.code}</p>
          <h3 className="text-lg font-bold">{program.name}</h3>
          <p className="text-sm text-muted-foreground">{program.description ?? "Geen interne beschrijving."}</p>
        </div>
        <div className="flex gap-2">
          <StatusPill tone={setting?.status === "published" ? "success" : "neutral"}>{setting?.status ?? "geen publicatie"}</StatusPill>
          <StatusPill tone={config?.status === "active" ? "success" : "neutral"}>{config?.status ?? "geen intake"}</StatusPill>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <form action={upsertProgramPublicSettingsAction} className="grid gap-3 rounded-2xl border border-border bg-card p-4">
          <input name="program_id" type="hidden" value={program.id} />
          <input name="program_name" type="hidden" value={program.name} />
          <div className="grid gap-3 md:grid-cols-3">
            <TextField defaultValue={setting?.public_slug ?? program.code} label="Publieke slug" name="public_slug" required />
            <SelectField defaultValue={setting?.status ?? "published"} label="Status" name="status" options={["draft", "published", "archived"]} />
            <TextField defaultValue={(setting?.sort_order ?? program.sort_order).toString()} label="Volgorde" name="sort_order" type="number" />
          </div>
          <TextField defaultValue={setting?.summary ?? program.description ?? ""} label="Samenvatting" name="summary" />
          <TextAreaField defaultValue={setting?.detail ?? ""} label="Detailtekst" name="detail" />
          <div className="grid gap-3 md:grid-cols-2">
            <TextField defaultValue={setting?.age_label ?? ""} label="Leeftijd" name="age_label" />
            <TextField defaultValue={setting?.duration_label ?? ""} label="Duur" name="duration_label" />
            <TextField defaultValue={setting?.price_label ?? ""} label="Prijslabel" name="price_label" />
            <TextField defaultValue={setting?.capacity_label ?? ""} label="Capaciteit" name="capacity_label" />
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <CheckboxField defaultChecked={setting?.trial_enabled ?? true} label="Proefles" name="trial_enabled" />
            <CheckboxField defaultChecked={setting?.registration_enabled ?? true} label="Inschrijven" name="registration_enabled" />
            <CheckboxField defaultChecked={setting?.waitlist_enabled ?? true} label="Wachtlijst" name="waitlist_enabled" />
          </div>
          <SubmitButton>Programma publiceren</SubmitButton>
        </form>

        <form action={upsertIntakeFormConfigAction} className="grid gap-3 rounded-2xl border border-border bg-card p-4">
          <input name="program_id" type="hidden" value={program.id} />
          <div className="grid gap-3 md:grid-cols-2">
            <SelectField defaultValue={config?.status ?? "active"} label="Intakestatus" name="status" options={["draft", "active", "archived"]} />
            <div className="grid gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Opties</span>
              <div className="grid gap-2 sm:grid-cols-3">
                <CheckboxField defaultChecked={config?.allowed_intake_options.includes("trial") ?? true} label="Proefles" name="allowed_intake_options" value="trial" />
                <CheckboxField defaultChecked={config?.allowed_intake_options.includes("registration") ?? true} label="Inschrijven" name="allowed_intake_options" value="registration" />
                <CheckboxField defaultChecked={config?.allowed_intake_options.includes("waitlist") ?? true} label="Wachtlijst" name="allowed_intake_options" value="waitlist" />
              </div>
            </div>
          </div>
          <TextAreaField defaultValue={config?.intro ?? ""} label="Intro bij intakeformulier" name="intro" />
          <JsonField defaultValue={jsonText(config?.custom_questions, defaultQuestions)} label="Custom vragen JSON" name="custom_questions_json" />
          <SubmitButton>Intakeconfig opslaan</SubmitButton>
        </form>
      </div>
    </div>
  );
}

function WebsiteSettingsStatus({ snapshot }: Props) {
  return (
    <div className="grid gap-6">
      <PageHeader kicker="Backoffice - instellingen" subtitle="Controleer tenantcontext en Supabase configuratie." title="Tenantwebsite instellingen niet beschikbaar" />
      <Card>
        <StatusPill tone="warning">{snapshot.status}</StatusPill>
        <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
          {snapshot.errors.length === 0 ? <p>Geen extra foutdetails beschikbaar.</p> : null}
          {snapshot.errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      </Card>
    </div>
  );
}

function MetricCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div>
      <h2 className="text-lg font-bold">{title}</h2>
    </div>
  );
}

function TextField({ label, name, defaultValue, placeholder, required, type = "text" }: { label: string; name: string; defaultValue?: string; placeholder?: string; required?: boolean; type?: string }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold">
      <span>{label}</span>
      <input className="h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none ring-primary/20 focus:ring-4" defaultValue={defaultValue} name={name} placeholder={placeholder} required={required} type={type} />
    </label>
  );
}

function TextAreaField({ label, name, defaultValue }: { label: string; name: string; defaultValue?: string }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold">
      <span>{label}</span>
      <textarea className="min-h-24 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none ring-primary/20 focus:ring-4" defaultValue={defaultValue} name={name} />
    </label>
  );
}

function JsonField({ label, name, defaultValue }: { label: string; name: string; defaultValue: string }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold">
      <span>{label}</span>
      <textarea className="min-h-40 rounded-xl border border-border bg-slate-950 px-3 py-2 font-mono text-xs leading-5 text-slate-50 outline-none ring-primary/20 focus:ring-4" defaultValue={defaultValue} name={name} spellCheck={false} />
    </label>
  );
}

function SelectField({ label, name, defaultValue, options }: { label: string; name: string; defaultValue: string; options: string[] }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold">
      <span>{label}</span>
      <select className="h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none ring-primary/20 focus:ring-4" defaultValue={defaultValue} name={name}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function CheckboxField({ label, name, value = "on", defaultChecked }: { label: string; name: string; value?: string; defaultChecked?: boolean }) {
  return (
    <label className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-semibold">
      <input className="h-4 w-4 accent-primary" defaultChecked={defaultChecked} name={name} type="checkbox" value={value} />
      {label}
    </label>
  );
}

function SubmitButton({ children }: { children: ReactNode }) {
  return (
    <button className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-glow hover:bg-primary/90 md:w-fit" type="submit">
      {children}
    </button>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-center text-sm text-muted-foreground">{children}</div>;
}

function createFallbackProfile(tenantName: string): TenantPublicProfileSettingsRow {
  return {
    tenant_id: "",
    status: "draft",
    hero_title: `Zwemles met vertrouwen bij ${tenantName}`,
    hero_subtitle: "Kleine groepen, persoonlijke begeleiding en realtime ouderinzage.",
    primary_cta_label: "Plan intake",
    secondary_cta_label: "Bekijk programma's",
    intro_title: "Van intake naar de juiste groep",
    intro_body: "Programma's, niveaus en intake-opties worden uit de tenantdata gelezen.",
    logo_url: "/lovable/zwemdemo-logo.png",
    hero_image_url: "/lovable/hero-swim.png",
    hero_image_alt: "Kind in zwembad",
    brand_primary_hex: "#1d4ed8",
    brand_accent_hex: "#b6ff2e",
    location_label: "Den Haag",
    footer_tagline: "Samen elke druppel vooruit.",
    contact_email: null,
    contact_phone: null,
    address_lines: [],
    seo_title: null,
    seo_description: null,
    news_items: defaultNewsItems,
    agenda_items: defaultAgendaItems
  };
}

function jsonText(value: unknown, fallback: unknown[]) {
  const parsed = Array.isArray(value) ? value : fallback;

  return JSON.stringify(parsed, null, 2);
}
