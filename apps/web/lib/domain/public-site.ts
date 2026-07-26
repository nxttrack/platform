import "server-only";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import {
  deriveDaypart,
  type PublicIntakeSlot,
  type WaitTimeBand
} from "./intake-recommendation-contract";
import { summarizeGroupCapacity, type GroupMembershipRow, type GroupRow, type ProgramRow, type ProgramStageRow } from "./core";

export type IntakeOption = "enrollment" | "trial" | "waitlist" | "information_request";

export type PublicTenant = {
  id: string;
  slug: string;
  name: string;
  sector: string;
};

export type PublicIntakeForm = {
  id: string | null;
  name: string;
  intro: string | null;
  allowedOptions: IntakeOption[];
  questions: PublicIntakeQuestion[];
};

export type PublicIntakeQuestion = {
  id: string | null;
  fieldKey: string;
  label: string;
  helpText: string | null;
  fieldType: "text" | "textarea" | "select" | "checkbox" | "date";
  required: boolean;
  options: string[];
  appliesToOptions: IntakeOption[];
  sortOrder: number;
};

export type PublicProgram = ProgramRow & {
  stages: ProgramStageRow[];
  waitBand: WaitTimeBand;
  slots: PublicIntakeSlot[];
  form: PublicIntakeForm;
};

export type PublicTenantSiteData = {
  tenant: PublicTenant;
  analyticsMeasurementId: string | null;
  programs: PublicProgram[];
  defaultForm: PublicIntakeForm;
};

type IntakeFormRow = {
  id: string;
  program_id: string | null;
  name: string;
  intro: string | null;
  allowed_options: IntakeOption[];
};

type IntakeQuestionRow = {
  id: string;
  form_id: string;
  field_key: string;
  label: string;
  help_text: string | null;
  field_type: PublicIntakeQuestion["fieldType"];
  required: boolean;
  options: unknown;
  applies_to_options: IntakeOption[];
  sort_order: number;
};

type WaitlistPressureRow = {
  program_id: string;
  recommended_stage_id: string | null;
};

type PublicAnalyticsSettingsRow = {
  analytics_enabled: boolean;
  google_analytics_measurement_id: string | null;
};

export async function getPublicTenantSiteData(): Promise<PublicTenantSiteData | null> {
  const slug = await getTenantSlugFromRequest();

  if (!slug || !canUsePublicSiteData()) {
    return null;
  }

  return getPublicTenantSiteDataBySlug(slug);
}

export async function getPublicTenantSiteDataBySlug(slug: string): Promise<PublicTenantSiteData | null> {
  if (!canUsePublicSiteData()) {
    return null;
  }

  const admin = createAdminClient();
  const tenantResult = await admin.from("tenants").select("id, slug, name, sector").eq("slug", slug).eq("status", "active").maybeSingle();

  if (tenantResult.error || !tenantResult.data) {
    return null;
  }

  const tenant = tenantResult.data as PublicTenant;
  const [programsResult, stagesResult, groupsResult, membershipsResult, waitlistResult, formsResult, questionsResult, settingsResult] = await Promise.all([
    admin.from("programs").select("id, name, code, description, status, sort_order").eq("tenant_id", tenant.id).eq("status", "active").order("sort_order").order("name"),
    admin.from("program_stages").select("id, program_id, name, code, badge_label, color_hex, status, sort_order").eq("tenant_id", tenant.id).eq("status", "active").order("sort_order").order("name"),
    admin.from("groups").select("id, program_id, stage_id, default_resource_id, name, code, status, capacity, default_weekday, default_start_time, default_end_time").eq("tenant_id", tenant.id).eq("status", "active"),
    admin.from("group_memberships").select("id, group_id, enrollment_id, participant_id, status, capacity_weight").eq("tenant_id", tenant.id),
    admin
      .from("waitlist_entries")
      .select("program_id, recommended_stage_id")
      .eq("tenant_id", tenant.id)
      .in("status", ["waiting", "reviewing", "offered"]),
    admin.from("intake_forms").select("id, program_id, name, intro, allowed_options").eq("tenant_id", tenant.id).eq("status", "active"),
    admin
      .from("intake_questions")
      .select("id, form_id, field_key, label, help_text, field_type, required, options, applies_to_options, sort_order")
      .eq("tenant_id", tenant.id)
      .order("sort_order"),
    admin
      .from("tenant_settings")
      .select("analytics_enabled, google_analytics_measurement_id")
      .eq("tenant_id", tenant.id)
      .maybeSingle()
  ]);

  assertPublicResult(programsResult.error, "programs");
  assertPublicResult(stagesResult.error, "program stages");
  assertPublicResult(groupsResult.error, "groups");
  assertPublicResult(membershipsResult.error, "group memberships");
  assertPublicResult(waitlistResult.error, "waitlist pressure");
  assertPublicResult(formsResult.error, "intake forms");
  assertPublicResult(questionsResult.error, "intake questions");
  assertPublicResult(settingsResult.error, "analytics settings");

  const programs = (programsResult.data ?? []) as ProgramRow[];
  const stages = (stagesResult.data ?? []) as ProgramStageRow[];
  const groups = (groupsResult.data ?? []) as GroupRow[];
  const memberships = (membershipsResult.data ?? []) as GroupMembershipRow[];
  const waitlist = (waitlistResult.data ?? []) as WaitlistPressureRow[];
  const forms = (formsResult.data ?? []) as IntakeFormRow[];
  const questions = (questionsResult.data ?? []) as IntakeQuestionRow[];
  const analyticsSettings = settingsResult.data as PublicAnalyticsSettingsRow | null;
  const capacityByGroup = new Map(summarizeGroupCapacity(groups, memberships).map((capacity) => [capacity.groupId, capacity]));
  const formsByProgramId = new Map(forms.filter((form) => form.program_id).map((form) => [form.program_id as string, normalizeForm(form, questions)]));
  const defaultForm = normalizeForm(forms.find((form) => !form.program_id) ?? null, questions);

  return {
    tenant,
    analyticsMeasurementId: analyticsSettings?.analytics_enabled ? analyticsSettings.google_analytics_measurement_id : null,
    defaultForm,
    programs: programs.map((program) => {
      const programGroups = groups.filter((group) => group.program_id === program.id);
      const programStages = stages.filter((stage) => stage.program_id === program.id);
      const slots = programGroups.flatMap((group): PublicIntakeSlot[] => {
        if (group.default_weekday === null || !group.default_start_time || !group.default_end_time) {
          return [];
        }

        const stage = programStages.find((candidate) => candidate.id === group.stage_id) ?? null;
        const pressure = waitlist.filter(
          (entry) => entry.program_id === program.id && (!entry.recommended_stage_id || entry.recommended_stage_id === group.stage_id)
        ).length;
        const capacity = capacityByGroup.get(group.id);

        return [
          {
            groupId: group.id,
            programId: program.id,
            groupName: group.name,
            stageId: stage?.id ?? null,
            stageName: stage?.badge_label ?? stage?.name ?? null,
            stageSortOrder: stage?.sort_order ?? null,
            weekday: group.default_weekday,
            weekdayLabel: weekdayLabels[group.default_weekday] ?? "Dag",
            daypart: deriveDaypart(group.default_start_time),
            startsAt: group.default_start_time.slice(0, 5),
            endsAt: group.default_end_time.slice(0, 5),
            waitBand: deriveWaitBand({
              available: Math.max(0, capacity?.available ?? 0),
              capacity: Math.max(1, capacity?.capacity ?? group.capacity),
              pressure
            })
          }
        ];
      });

      return {
        ...program,
        stages: programStages,
        waitBand: getBestWaitBand(slots),
        slots,
        form: formsByProgramId.get(program.id) ?? defaultForm
      };
    })
  };
}

export async function getTenantSlugFromRequest() {
  const headerStore = await headers();

  return headerStore.get("x-nxttrack-tenant-slug");
}

export async function getRequestHostname() {
  const headerStore = await headers();

  return headerStore.get("x-nxttrack-hostname") ?? headerStore.get("host") ?? null;
}

export function getDefaultIntakeForm(): PublicIntakeForm {
  return {
    id: null,
    name: "Aanmelden",
    intro: "Vertel kort wie je wilt aanmelden en waar je naar zoekt.",
    allowedOptions: ["enrollment", "trial", "waitlist", "information_request"],
    questions: [
      {
        id: null,
        fieldKey: "swimming_experience",
        label: "Heeft je kind al zwemervaring?",
        helpText: null,
        fieldType: "textarea",
        required: false,
        options: [],
        appliesToOptions: ["enrollment", "trial", "waitlist"],
        sortOrder: 10
      },
      {
        id: null,
        fieldKey: "preferred_moment",
        label: "Welke dagen of tijden hebben voorkeur?",
        helpText: null,
        fieldType: "textarea",
        required: false,
        options: [],
        appliesToOptions: ["enrollment", "trial", "waitlist"],
        sortOrder: 20
      }
    ]
  };
}

function normalizeForm(form: IntakeFormRow | null, questions: IntakeQuestionRow[]): PublicIntakeForm {
  if (!form) {
    return getDefaultIntakeForm();
  }

  return {
    id: form.id,
    name: form.name,
    intro: form.intro,
    allowedOptions: form.allowed_options,
    questions: questions
      .filter((question) => question.form_id === form.id)
      .map((question) => ({
        id: question.id,
        fieldKey: question.field_key,
        label: question.label,
        helpText: question.help_text,
        fieldType: question.field_type,
        required: question.required,
        options: Array.isArray(question.options) ? question.options.filter((value): value is string => typeof value === "string") : [],
        appliesToOptions: question.applies_to_options,
        sortOrder: question.sort_order
      }))
  };
}

function canUsePublicSiteData() {
  return !!getSupabasePublicConfig() && !!process.env.SUPABASE_SECRET_KEY;
}

function assertPublicResult(error: { message: string } | null, label: string) {
  if (error) {
    throw new Error(`Could not load public tenant ${label}: ${error.message}`);
  }
}

const weekdayLabels: Record<number, string> = {
  1: "Maandag",
  2: "Dinsdag",
  3: "Woensdag",
  4: "Donderdag",
  5: "Vrijdag",
  6: "Zaterdag",
  7: "Zondag"
};

function deriveWaitBand(input: { available: number; capacity: number; pressure: number }): WaitTimeBand {
  const availableRatio = input.available / input.capacity;

  if (input.available > 0 && (availableRatio >= 0.15 || input.pressure === 0)) {
    return "short";
  }

  if (input.available > 0 || input.pressure <= 2) {
    return "medium";
  }

  return "long";
}

function getBestWaitBand(slots: PublicIntakeSlot[]): WaitTimeBand {
  if (slots.some((slot) => slot.waitBand === "short")) {
    return "short";
  }

  if (slots.some((slot) => slot.waitBand === "medium")) {
    return "medium";
  }

  return "long";
}
