import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type TenantPublicProfileSettingsRow = {
  tenant_id: string;
  status: string;
  hero_title: string;
  hero_subtitle: string;
  primary_cta_label: string;
  secondary_cta_label: string;
  intro_title: string | null;
  intro_body: string | null;
  logo_url: string | null;
  hero_image_url: string | null;
  hero_image_alt: string | null;
  brand_primary_hex: string;
  brand_accent_hex: string;
  location_label: string | null;
  footer_tagline: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address_lines: string[];
  seo_title: string | null;
  seo_description: string | null;
  social_image_url: string | null;
  news_items: unknown;
  agenda_items: unknown;
};

export type TenantWebsiteProgramRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  sort_order: number;
};

export type ProgramPublicSettingsRow = {
  id: string;
  program_id: string;
  public_slug: string;
  status: string;
  summary: string | null;
  detail: string | null;
  age_label: string | null;
  duration_label: string | null;
  price_label: string | null;
  capacity_label: string | null;
  trial_enabled: boolean;
  registration_enabled: boolean;
  waitlist_enabled: boolean;
  sort_order: number;
};

export type IntakeFormConfigSettingsRow = {
  id: string;
  program_id: string;
  config_version: number;
  schema_version: string;
  status: string;
  intro: string | null;
  allowed_intake_options: string[];
  custom_questions: unknown;
  conditional_rules: unknown;
  stage_recommendation_rules: unknown;
  published_at: string | null;
};

export type TenantDomainStatusRow = {
  id: string;
  hostname: string;
  kind: string;
  status: string;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminTenantWebsiteSettingsData = {
  profile: TenantPublicProfileSettingsRow | null;
  programs: TenantWebsiteProgramRow[];
  programSettings: ProgramPublicSettingsRow[];
  intakeConfigs: IntakeFormConfigSettingsRow[];
  domains: TenantDomainStatusRow[];
};

export type AdminTenantWebsiteSettingsSnapshot = {
  status: "ready" | "not_configured" | "no_tenant" | "query_error";
  tenant: {
    id: string;
    name: string;
    slug: string;
    sector: string;
  } | null;
  data: AdminTenantWebsiteSettingsData;
  errors: string[];
};

export async function getAdminTenantWebsiteSettingsSnapshot(): Promise<AdminTenantWebsiteSettingsSnapshot> {
  const emptyData = createEmptyData();
  const selection = await getActiveTenantSelection();
  const context = await getTrustedAuthContext(selection);

  if (context.status !== "authenticated" || !context.activeTenant) {
    return {
      status: "no_tenant",
      tenant: null,
      data: emptyData,
      errors: ["Geen actieve tenant gevonden voor website-instellingen."]
    };
  }

  const tenant = {
    id: context.activeTenant.tenantId,
    name: context.activeTenant.name,
    slug: context.activeTenant.slug,
    sector: context.activeTenant.sector
  };

  if (!getSupabasePublicConfig()) {
    return {
      status: "not_configured",
      tenant,
      data: emptyData,
      errors: ["Supabase is nog niet geconfigureerd in deze runtime."]
    };
  }

  const supabase = await createClient();
  const tenantId = tenant.id;
  const [profileResult, programsResult, programSettingsResult, intakeConfigsResult, domainsResult] = await Promise.all([
    supabase
      .from("tenant_public_profiles")
      .select(
        "tenant_id, status, hero_title, hero_subtitle, primary_cta_label, secondary_cta_label, intro_title, intro_body, logo_url, hero_image_url, hero_image_alt, brand_primary_hex, brand_accent_hex, location_label, footer_tagline, contact_email, contact_phone, address_lines, seo_title, seo_description, social_image_url, news_items, agenda_items"
      )
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabase.from("programs").select("id, code, name, description, status, sort_order").eq("tenant_id", tenantId).order("sort_order", { ascending: true }).order("name", { ascending: true }),
    supabase
      .from("program_public_settings")
      .select("id, program_id, public_slug, status, summary, detail, age_label, duration_label, price_label, capacity_label, trial_enabled, registration_enabled, waitlist_enabled, sort_order")
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true }),
    supabase.from("intake_form_configs").select("id, program_id, config_version, schema_version, status, intro, allowed_intake_options, custom_questions, conditional_rules, stage_recommendation_rules, published_at").eq("tenant_id", tenantId),
    supabase.from("tenant_domains").select("id, hostname, kind, status, is_primary, created_at, updated_at").eq("tenant_id", tenantId).order("is_primary", { ascending: false }).order("hostname", { ascending: true })
  ]);

  const errors = collectErrors({
    tenant_public_profiles: profileResult.error,
    programs: programsResult.error,
    program_public_settings: programSettingsResult.error,
    intake_form_configs: intakeConfigsResult.error,
    tenant_domains: domainsResult.error
  });

  return {
    status: errors.length > 0 ? "query_error" : "ready",
    tenant,
    errors,
    data: {
      profile: profileResult.data ? (profileResult.data as TenantPublicProfileSettingsRow) : null,
      programs: asRows<TenantWebsiteProgramRow>(programsResult.data),
      programSettings: asRows<ProgramPublicSettingsRow>(programSettingsResult.data),
      intakeConfigs: asRows<IntakeFormConfigSettingsRow>(intakeConfigsResult.data),
      domains: asRows<TenantDomainStatusRow>(domainsResult.data)
    }
  };
}

function createEmptyData(): AdminTenantWebsiteSettingsData {
  return {
    profile: null,
    programs: [],
    programSettings: [],
    intakeConfigs: [],
    domains: []
  };
}

function collectErrors(errorsByTable: Record<string, { message: string } | null>): string[] {
  return Object.entries(errorsByTable).flatMap(([table, error]) => {
    return error ? [`${table}: ${error.message}`] : [];
  });
}

function asRows<Row>(rows: unknown): Row[] {
  return Array.isArray(rows) ? (rows as Row[]) : [];
}
