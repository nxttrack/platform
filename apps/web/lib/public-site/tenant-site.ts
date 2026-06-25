import { headers } from "next/headers";

import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type IntakeQuestion = {
  name: string;
  label: string;
  type: "text" | "textarea" | "single_select" | "multi_select" | "yes_no" | "number" | "date" | "free_text" | "consent" | "swim_experience_scale";
  required?: boolean;
  helpText?: string | null;
  options?: IntakeQuestionOption[];
  condition?: IntakeCondition | null;
};

export type IntakeQuestionOption = {
  label: string;
  value: string;
};

export type IntakeCondition = {
  question: string;
  operator: "equals" | "not_equals" | "in" | "exists";
  value?: string | string[];
};

export type StageRecommendationRule = {
  stageId?: string | null;
  stageCode?: string | null;
  label?: string | null;
  baseScore?: number | null;
  conditions?: StageRecommendationCondition[];
};

export type StageRecommendationCondition = {
  question: string;
  operator: "equals" | "not_equals" | "in" | "contains" | "exists" | "gte" | "lte";
  value?: string | string[] | number | boolean | null;
  points?: number;
  reason?: string;
  required?: boolean;
};

export type PublicTenant = {
  id: string;
  slug: string;
  name: string;
  sector: string;
};

export type PublicTenantProfile = {
  heroTitle: string;
  heroSubtitle: string;
  primaryCtaLabel: string;
  secondaryCtaLabel: string;
  introTitle: string | null;
  introBody: string | null;
  logoUrl: string | null;
  heroImageUrl: string | null;
  heroImageAlt: string | null;
  brandPrimaryHex: string;
  brandAccentHex: string;
  locationLabel: string | null;
  footerTagline: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  addressLines: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  socialImageUrl: string | null;
  newsItems: PublicNewsItem[];
  agendaItems: PublicAgendaItem[];
};

export type PublicNewsItem = {
  title: string;
  body: string;
  date: string;
};

export type PublicAgendaItem = {
  title: string;
  time: string;
  location: string;
};

export type PublicProgram = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  slug: string;
  summary: string | null;
  detail: string | null;
  ageLabel: string | null;
  durationLabel: string | null;
  priceLabel: string | null;
  capacityLabel: string | null;
  trialEnabled: boolean;
  registrationEnabled: boolean;
  waitlistEnabled: boolean;
  stages: { id: string; name: string; code: string; sortOrder: number }[];
  intakeConfig: {
    id: string;
    configVersion: number;
    schemaVersion: string;
    intro: string | null;
    allowedOptions: string[];
    questions: IntakeQuestion[];
    conditionalRules: IntakeCondition[];
    stageRecommendationRules: StageRecommendationRule[];
  } | null;
};

export type PublicTenantSiteSnapshot = {
  status: "ready" | "not_configured" | "no_tenant" | "query_error";
  tenant: PublicTenant | null;
  profile: PublicTenantProfile | null;
  programs: PublicProgram[];
  selectedProgram: PublicProgram | null;
  errors: string[];
};

type TenantRow = {
  id: string;
  slug: string;
  name: string;
  sector: string;
};

type ProfileRow = {
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
  address_lines: string[] | null;
  seo_title: string | null;
  seo_description: string | null;
  social_image_url: string | null;
  news_items: unknown;
  agenda_items: unknown;
};

type ProgramRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sort_order: number;
};

type ProgramSettingRow = {
  program_id: string;
  public_slug: string;
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

type StageRow = {
  id: string;
  program_id: string;
  code: string;
  name: string;
  sort_order: number;
};

type IntakeConfigRow = {
  id: string;
  program_id: string;
  config_version: number | null;
  schema_version: string | null;
  intro: string | null;
  allowed_intake_options: string[] | null;
  custom_questions: unknown;
  conditional_rules: unknown;
  stage_recommendation_rules: unknown;
};

export async function getPublicTenantSiteSnapshot(programSlug?: string | null): Promise<PublicTenantSiteSnapshot> {
  if (!getSupabasePublicConfig()) {
    return emptySnapshot("not_configured", ["Supabase is nog niet geconfigureerd."]);
  }

  const supabase = await createClient();
  const tenantLookup = await resolveTenantLookup();
  const tenantResult =
    tenantLookup.kind === "domain"
      ? await resolveTenantByDomain(tenantLookup.hostname)
      : await supabase.from("tenants").select("id, slug, name, sector").eq("slug", tenantLookup.slug).eq("status", "active").maybeSingle();

  if (tenantResult.error) {
    return emptySnapshot("query_error", [`tenants: ${tenantResult.error.message}`]);
  }

  const tenantRow = tenantResult.data as TenantRow | null;

  if (!tenantRow) {
    return emptySnapshot("no_tenant", [`Geen actieve tenant gevonden voor ${tenantLookup.kind === "domain" ? tenantLookup.hostname : tenantLookup.slug}.`]);
  }

  const tenant = {
    id: tenantRow.id,
    slug: tenantRow.slug,
    name: tenantRow.name,
    sector: tenantRow.sector
  };

  const [profileResult, programSettingsResult, programsResult, stagesResult, intakeConfigsResult] = await Promise.all([
    supabase
      .from("tenant_public_profiles")
      .select(
        "hero_title, hero_subtitle, primary_cta_label, secondary_cta_label, intro_title, intro_body, logo_url, hero_image_url, hero_image_alt, brand_primary_hex, brand_accent_hex, location_label, footer_tagline, contact_email, contact_phone, address_lines, seo_title, seo_description, social_image_url, news_items, agenda_items"
      )
      .eq("tenant_id", tenant.id)
      .eq("status", "published")
      .maybeSingle(),
    supabase
      .from("program_public_settings")
      .select("program_id, public_slug, summary, detail, age_label, duration_label, price_label, capacity_label, trial_enabled, registration_enabled, waitlist_enabled, sort_order")
      .eq("tenant_id", tenant.id)
      .eq("status", "published")
      .order("sort_order", { ascending: true }),
    supabase.from("programs").select("id, code, name, description, sort_order").eq("tenant_id", tenant.id).eq("status", "active").order("sort_order", { ascending: true }),
    supabase.from("stages").select("id, program_id, code, name, sort_order").eq("tenant_id", tenant.id).eq("status", "active").order("sort_order", { ascending: true }),
    supabase.from("intake_form_configs").select("id, program_id, config_version, schema_version, intro, allowed_intake_options, custom_questions, conditional_rules, stage_recommendation_rules").eq("tenant_id", tenant.id).eq("status", "active")
  ]);

  const errors = collectErrors({
    tenant_public_profiles: profileResult.error,
    program_public_settings: programSettingsResult.error,
    programs: programsResult.error,
    stages: stagesResult.error,
    intake_form_configs: intakeConfigsResult.error
  });

  const settings = asRows<ProgramSettingRow>(programSettingsResult.data);
  const programsById = new Map(asRows<ProgramRow>(programsResult.data).map((program) => [program.id, program]));
  const stagesByProgram = groupBy(asRows<StageRow>(stagesResult.data), (stage) => stage.program_id);
  const configsByProgram = new Map(asRows<IntakeConfigRow>(intakeConfigsResult.data).map((config) => [config.program_id, config]));
  const programs = settings.flatMap((setting) => {
    const program = programsById.get(setting.program_id);

    if (!program) {
      return [];
    }

    const config = configsByProgram.get(program.id) ?? null;

    return [
      {
        id: program.id,
        code: program.code,
        name: program.name,
        description: program.description,
        slug: setting.public_slug,
        summary: setting.summary,
        detail: setting.detail,
        ageLabel: setting.age_label,
        durationLabel: setting.duration_label,
        priceLabel: setting.price_label,
        capacityLabel: setting.capacity_label,
        trialEnabled: setting.trial_enabled,
        registrationEnabled: setting.registration_enabled,
        waitlistEnabled: setting.waitlist_enabled,
        stages: (stagesByProgram.get(program.id) ?? []).map((stage) => ({
          id: stage.id,
          name: stage.name,
          code: stage.code,
          sortOrder: stage.sort_order
        })),
        intakeConfig: config
          ? {
              id: config.id,
              configVersion: config.config_version ?? 1,
              schemaVersion: config.schema_version ?? "s1",
              intro: config.intro,
              allowedOptions: config.allowed_intake_options ?? [],
              questions: parseQuestions(config.custom_questions),
              conditionalRules: parseConditions(config.conditional_rules),
              stageRecommendationRules: parseStageRecommendationRules(config.stage_recommendation_rules)
            }
          : null
      }
    ];
  });

  const profileRow = profileResult.data as ProfileRow | null;
  const profile = profileRow
    ? {
        heroTitle: profileRow.hero_title,
        heroSubtitle: profileRow.hero_subtitle,
        primaryCtaLabel: profileRow.primary_cta_label,
        secondaryCtaLabel: profileRow.secondary_cta_label,
        introTitle: profileRow.intro_title,
        introBody: profileRow.intro_body,
        logoUrl: profileRow.logo_url,
        heroImageUrl: profileRow.hero_image_url,
        heroImageAlt: profileRow.hero_image_alt,
        brandPrimaryHex: profileRow.brand_primary_hex,
        brandAccentHex: profileRow.brand_accent_hex,
        locationLabel: profileRow.location_label,
        footerTagline: profileRow.footer_tagline,
        contactEmail: profileRow.contact_email,
        contactPhone: profileRow.contact_phone,
        addressLines: profileRow.address_lines ?? [],
        seoTitle: profileRow.seo_title,
        seoDescription: profileRow.seo_description,
        socialImageUrl: profileRow.social_image_url,
        newsItems: parseNewsItems(profileRow.news_items),
        agendaItems: parseAgendaItems(profileRow.agenda_items)
      }
    : null;

  return {
    status: errors.length > 0 ? "query_error" : "ready",
    tenant,
    profile,
    programs,
    selectedProgram: programSlug ? (programs.find((program) => program.slug === programSlug) ?? null) : null,
    errors
  };

  async function resolveTenantByDomain(hostname: string) {
    const domainResult = await supabase.from("tenant_domains").select("tenant_id").eq("hostname", hostname).eq("status", "verified").maybeSingle();

    if (domainResult.error || !domainResult.data) {
      return {
        data: null,
        error: domainResult.error
      };
    }

    return supabase.from("tenants").select("id, slug, name, sector").eq("id", (domainResult.data as { tenant_id: string }).tenant_id).eq("status", "active").maybeSingle();
  }
}

function parseNewsItems(value: unknown): PublicNewsItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const row = item as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title : "";
    const body = typeof row.body === "string" ? row.body : "";
    const date = typeof row.date === "string" ? row.date : "";

    return title && body ? [{ title, body, date }] : [];
  });
}

function parseAgendaItems(value: unknown): PublicAgendaItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const row = item as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title : "";
    const time = typeof row.time === "string" ? row.time : "";
    const location = typeof row.location === "string" ? row.location : "";

    return title && time ? [{ title, time, location }] : [];
  });
}

async function resolveTenantLookup(): Promise<{ kind: "slug"; slug: string } | { kind: "domain"; hostname: string }> {
  const headerStore = await headers();
  const headerSlug = headerStore.get("x-nxttrack-tenant-slug");
  const hostname = headerStore.get("x-nxttrack-hostname");

  if (headerSlug) {
    return { kind: "slug", slug: headerSlug };
  }

  if (headerStore.get("x-nxttrack-host-kind") === "custom_domain" && hostname) {
    return { kind: "domain", hostname };
  }

  return { kind: "slug", slug: process.env.DEFAULT_TENANT_SLUG ?? "aquaswim-demo" };
}

function emptySnapshot(status: PublicTenantSiteSnapshot["status"], errors: string[]): PublicTenantSiteSnapshot {
  return {
    status,
    tenant: null,
    profile: null,
    programs: [],
    selectedProgram: null,
    errors
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

function groupBy<Row>(rows: Row[], getKey: (row: Row) => string) {
  const grouped = new Map<string, Row[]>();

  for (const row of rows) {
    const key = getKey(row);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  return grouped;
}

function parseQuestions(value: unknown): IntakeQuestion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const question = item as Record<string, unknown>;
    const name = typeof question.name === "string" ? question.name : "";
    const label = typeof question.label === "string" ? question.label : "";
    const type = parseQuestionType(question.type);

    return name && label
      ? [
          {
            name,
            label,
            type,
            required: question.required === true,
            helpText: typeof question.helpText === "string" ? question.helpText : null,
            options: parseQuestionOptions(question.options),
            condition: parseCondition(question.condition)
          }
        ]
      : [];
  });
}

function parseQuestionType(value: unknown): IntakeQuestion["type"] {
  const types: IntakeQuestion["type"][] = ["text", "textarea", "single_select", "multi_select", "yes_no", "number", "date", "free_text", "consent", "swim_experience_scale"];

  return types.includes(value as IntakeQuestion["type"]) ? (value as IntakeQuestion["type"]) : value === "textarea" ? "textarea" : "text";
}

function parseQuestionOptions(value: unknown): IntakeQuestionOption[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const option = item as Record<string, unknown>;
    const label = typeof option.label === "string" ? option.label : "";
    const optionValue = typeof option.value === "string" ? option.value : "";

    return label && optionValue ? [{ label, value: optionValue }] : [];
  });
}

function parseCondition(value: unknown): IntakeCondition | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;
  const question = typeof row.question === "string" ? row.question : "";
  const operator = parseConditionOperator(row.operator);

  if (!question || !operator) {
    return null;
  }

  const conditionValue = typeof row.value === "string" || Array.isArray(row.value) ? (row.value as string | string[]) : undefined;

  return {
    question,
    operator,
    value: conditionValue
  };
}

function parseConditions(value: unknown): IntakeCondition[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const parsed = parseCondition(item);
    return parsed ? [parsed] : [];
  });
}

function parseConditionOperator(value: unknown): IntakeCondition["operator"] | null {
  const operators: IntakeCondition["operator"][] = ["equals", "not_equals", "in", "exists"];

  return operators.includes(value as IntakeCondition["operator"]) ? (value as IntakeCondition["operator"]) : null;
}

function parseStageRecommendationRules(value: unknown): StageRecommendationRule[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const row = item as Record<string, unknown>;
    const stageId = typeof row.stage_id === "string" ? row.stage_id : typeof row.stageId === "string" ? row.stageId : null;
    const stageCode = typeof row.stage_code === "string" ? row.stage_code : typeof row.stageCode === "string" ? row.stageCode : null;

    if (!stageId && !stageCode) {
      return [];
    }

    return [
      {
        stageId,
        stageCode,
        label: typeof row.label === "string" ? row.label : null,
        baseScore: typeof row.base_score === "number" ? row.base_score : typeof row.baseScore === "number" ? row.baseScore : null,
        conditions: parseStageRecommendationConditions(row.conditions)
      }
    ];
  });
}

function parseStageRecommendationConditions(value: unknown): StageRecommendationCondition[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const row = item as Record<string, unknown>;
    const question = typeof row.question === "string" ? row.question : "";
    const operator = parseStageRuleOperator(row.operator);

    if (!question || !operator) {
      return [];
    }

    return [
      {
        question,
        operator,
        value: parseRuleValue(row.value),
        points: typeof row.points === "number" ? row.points : undefined,
        reason: typeof row.reason === "string" ? row.reason : undefined,
        required: row.required === true
      }
    ];
  });
}

function parseStageRuleOperator(value: unknown): StageRecommendationCondition["operator"] | null {
  const operators: StageRecommendationCondition["operator"][] = ["equals", "not_equals", "in", "contains", "exists", "gte", "lte"];

  return operators.includes(value as StageRecommendationCondition["operator"]) ? (value as StageRecommendationCondition["operator"]) : null;
}

function parseRuleValue(value: unknown): StageRecommendationCondition["value"] {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || Array.isArray(value)) {
    return value as StageRecommendationCondition["value"];
  }

  return null;
}
