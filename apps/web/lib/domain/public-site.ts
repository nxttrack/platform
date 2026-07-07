import "server-only";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
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
  availablePlaces: number;
  capacityStatus: "available" | "full" | "waitlist";
  form: PublicIntakeForm;
};

export type PublicTenantSiteData = {
  tenant: PublicTenant;
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
  const [programsResult, stagesResult, groupsResult, membershipsResult, formsResult, questionsResult] = await Promise.all([
    admin.from("programs").select("id, name, code, description, status, sort_order").eq("tenant_id", tenant.id).eq("status", "active").order("sort_order").order("name"),
    admin.from("program_stages").select("id, program_id, name, code, badge_label, color_hex, status, sort_order").eq("tenant_id", tenant.id).eq("status", "active").order("sort_order").order("name"),
    admin.from("groups").select("id, program_id, stage_id, default_resource_id, name, code, status, capacity, default_weekday, default_start_time, default_end_time").eq("tenant_id", tenant.id).eq("status", "active"),
    admin.from("group_memberships").select("id, group_id, enrollment_id, participant_id, status, capacity_weight").eq("tenant_id", tenant.id),
    admin.from("intake_forms").select("id, program_id, name, intro, allowed_options").eq("tenant_id", tenant.id).eq("status", "active"),
    admin
      .from("intake_questions")
      .select("id, form_id, field_key, label, help_text, field_type, required, options, applies_to_options, sort_order")
      .eq("tenant_id", tenant.id)
      .order("sort_order")
  ]);

  assertPublicResult(programsResult.error, "programs");
  assertPublicResult(stagesResult.error, "program stages");
  assertPublicResult(groupsResult.error, "groups");
  assertPublicResult(membershipsResult.error, "group memberships");
  assertPublicResult(formsResult.error, "intake forms");
  assertPublicResult(questionsResult.error, "intake questions");

  const programs = (programsResult.data ?? []) as ProgramRow[];
  const stages = (stagesResult.data ?? []) as ProgramStageRow[];
  const groups = (groupsResult.data ?? []) as GroupRow[];
  const memberships = (membershipsResult.data ?? []) as GroupMembershipRow[];
  const forms = (formsResult.data ?? []) as IntakeFormRow[];
  const questions = (questionsResult.data ?? []) as IntakeQuestionRow[];
  const capacityByGroup = new Map(summarizeGroupCapacity(groups, memberships).map((capacity) => [capacity.groupId, capacity]));
  const formsByProgramId = new Map(forms.filter((form) => form.program_id).map((form) => [form.program_id as string, normalizeForm(form, questions)]));
  const defaultForm = normalizeForm(forms.find((form) => !form.program_id) ?? null, questions);

  return {
    tenant,
    defaultForm,
    programs: programs.map((program) => {
      const programGroups = groups.filter((group) => group.program_id === program.id);
      const availablePlaces = programGroups.reduce((total, group) => total + Math.max(0, capacityByGroup.get(group.id)?.available ?? 0), 0);

      return {
        ...program,
        stages: stages.filter((stage) => stage.program_id === program.id),
        availablePlaces,
        capacityStatus: availablePlaces > 0 ? "available" : programGroups.length > 0 ? "full" : "waitlist",
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
