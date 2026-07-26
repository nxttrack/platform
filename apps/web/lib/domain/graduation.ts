import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantCoreData, type TenantCoreData } from "./core";

export type GraduationReadinessRow = {
  id: string;
  participant_id: string;
  enrollment_id: string;
  program_id: string;
  stage_id: string;
  status: string;
  readiness_score: number | null;
  checklist_summary: string | null;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  next_review_on: string | null;
  source: string;
  is_test: boolean;
  journey_run_id: string | null;
};

export type GraduationEventRow = {
  id: string;
  program_id: string | null;
  stage_id: string | null;
  resource_id: string | null;
  title: string;
  status: string;
  starts_at: string;
  ends_at: string;
  capacity: number | null;
  notes: string | null;
  created_by_user_id: string | null;
};

export type GraduationEventParticipantRow = {
  id: string;
  event_id: string;
  participant_id: string;
  enrollment_id: string;
  readiness_id: string | null;
  invite_status: string;
  status: string;
  invited_at: string | null;
  responded_at: string | null;
  result: string;
  result_registered_by_user_id: string | null;
  result_registered_at: string | null;
  result_notes: string | null;
};

export type CertificateRecordRow = {
  id: string;
  participant_id: string;
  enrollment_id: string;
  program_id: string;
  stage_id: string;
  event_participant_id: string | null;
  certificate_number: string | null;
  title: string;
  status: string;
  issued_on: string;
  issued_by_user_id: string | null;
  file_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  storage_bucket: string;
  storage_status: string;
  uploaded_at: string | null;
  notes: string | null;
};

export type GraduationAdminData = TenantCoreData & {
  readiness: GraduationReadinessRow[];
  graduationEvents: GraduationEventRow[];
  graduationParticipants: GraduationEventParticipantRow[];
  certificates: CertificateRecordRow[];
};

export async function getGraduationAdminData(): Promise<GraduationAdminData> {
  const core = await getTenantCoreData();
  const admin = createAdminClient();
  const [readinessResult, eventsResult, participantsResult, certificatesResult] = await Promise.all([
    admin
      .from("graduation_readiness")
      .select("id, participant_id, enrollment_id, program_id, stage_id, status, readiness_score, checklist_summary, reviewed_by_user_id, reviewed_at, next_review_on, source, is_test, journey_run_id")
      .eq("tenant_id", core.tenant.id)
      .order("reviewed_at", { ascending: false }),
    admin
      .from("graduation_events")
      .select("id, program_id, stage_id, resource_id, title, status, starts_at, ends_at, capacity, notes, created_by_user_id")
      .eq("tenant_id", core.tenant.id)
      .order("starts_at", { ascending: false }),
    admin
      .from("graduation_event_participants")
      .select("id, event_id, participant_id, enrollment_id, readiness_id, invite_status, status, invited_at, responded_at, result, result_registered_by_user_id, result_registered_at, result_notes")
      .eq("tenant_id", core.tenant.id)
      .order("created_at", { ascending: false }),
    admin
      .from("certificate_records")
      .select("id, participant_id, enrollment_id, program_id, stage_id, event_participant_id, certificate_number, title, status, issued_on, issued_by_user_id, file_path, file_name, mime_type, size_bytes, storage_bucket, storage_status, uploaded_at, notes")
      .eq("tenant_id", core.tenant.id)
      .order("issued_on", { ascending: false })
  ]);

  assertGraduationResult(readinessResult.error, "graduation readiness");
  assertGraduationResult(eventsResult.error, "graduation events");
  assertGraduationResult(participantsResult.error, "graduation event participants");
  assertGraduationResult(certificatesResult.error, "certificate records");

  return {
    ...core,
    readiness: (readinessResult.data ?? []) as GraduationReadinessRow[],
    graduationEvents: (eventsResult.data ?? []) as GraduationEventRow[],
    graduationParticipants: (participantsResult.data ?? []) as GraduationEventParticipantRow[],
    certificates: (certificatesResult.data ?? []) as CertificateRecordRow[]
  };
}

function assertGraduationResult(error: { message: string } | null, label: string) {
  if (error) {
    throw new Error(`Could not load ${label}: ${error.message}`);
  }
}
