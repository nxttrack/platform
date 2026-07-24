import "server-only";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant, type ProgramRow } from "./core";
import type { WaitTimeBand } from "./intake-recommendation-contract";
import type { IntakeOption } from "./public-site";

export type IntakeSubmissionRow = {
  id: string;
  program_id: string | null;
  selected_option: IntakeOption;
  parent_name: string;
  parent_email: string;
  parent_phone: string | null;
  secondary_parent_name: string | null;
  secondary_parent_email: string | null;
  secondary_parent_phone: string | null;
  participant_name: string;
  participant_birth_date: string | null;
  preferred_days: string[];
  preferred_dayparts: unknown;
  preferred_notes: string | null;
  message: string | null;
  swimming_experience: string | null;
  recommendation_snapshot: unknown;
  selected_group_id: string | null;
  selected_wait_band: WaitTimeBand | null;
  recommendation_version: string | null;
  status: string;
  received_at: string;
  duplicate_state: "unique" | "possible_duplicate" | "confirmed_duplicate" | "dismissed";
  duplicate_of_submission_id: string | null;
  source: string;
  is_test: boolean;
  journey_run_id: string | null;
};

export type IntakeAnswerRow = {
  id: string;
  submission_id: string;
  field_key: string;
  answer_text: string | null;
  answer_json: unknown;
};

export type TenantEventRow = {
  id: string;
  event_type: string;
  subject_id: string;
  status: string;
  created_at: string;
};

export type TenantIntakeInbox = {
  tenant: {
    id: string;
    slug: string;
    name: string;
  };
  programs: ProgramRow[];
  submissions: IntakeSubmissionRow[];
  answers: IntakeAnswerRow[];
  events: TenantEventRow[];
};

export async function getTenantIntakeInbox(): Promise<TenantIntakeInbox> {
  const context = await requirePrivateShellContext("/admin");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const [programsResult, submissionsResult, answersResult, eventsResult] = await Promise.all([
    admin.from("programs").select("id, name, code, description, status, sort_order").eq("tenant_id", tenant.id).order("sort_order").order("name"),
    admin
      .from("intake_submissions")
      .select("id, program_id, selected_option, parent_name, parent_email, parent_phone, secondary_parent_name, secondary_parent_email, secondary_parent_phone, participant_name, participant_birth_date, preferred_days, preferred_dayparts, preferred_notes, message, swimming_experience, recommendation_snapshot, selected_group_id, selected_wait_band, recommendation_version, status, received_at, duplicate_state, duplicate_of_submission_id, source, is_test, journey_run_id")
      .eq("tenant_id", tenant.id)
      .order("received_at", { ascending: false }),
    admin.from("intake_answers").select("id, submission_id, field_key, answer_text, answer_json").eq("tenant_id", tenant.id),
    admin.from("tenant_events").select("id, event_type, subject_id, status, created_at").eq("tenant_id", tenant.id).eq("event_type", "intake.received").order("created_at", { ascending: false })
  ]);

  assertInboxResult(programsResult.error, "programs");
  assertInboxResult(submissionsResult.error, "intake submissions");
  assertInboxResult(answersResult.error, "intake answers");
  assertInboxResult(eventsResult.error, "tenant events");

  return {
    tenant,
    programs: (programsResult.data ?? []) as ProgramRow[],
    submissions: (submissionsResult.data ?? []) as IntakeSubmissionRow[],
    answers: (answersResult.data ?? []) as IntakeAnswerRow[],
    events: (eventsResult.data ?? []) as TenantEventRow[]
  };
}

function assertInboxResult(error: { message: string } | null, label: string) {
  if (error) {
    throw new Error(`Could not load ${label}: ${error.message}`);
  }
}
