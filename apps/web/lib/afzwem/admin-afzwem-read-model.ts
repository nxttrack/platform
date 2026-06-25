import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type AfzwemProgramRow = {
  id: string;
  code: string;
  name: string;
};

export type AfzwemStageRow = {
  id: string;
  program_id: string;
  code: string;
  name: string;
  sort_order: number;
};

export type AfzwemResourceRow = {
  id: string;
  name: string;
  location_name: string | null;
  status: string;
};

export type AfzwemParticipantRow = {
  id: string;
  display_name: string;
  birthdate: string | null;
  status: string;
};

export type AfzwemEnrollmentRow = {
  id: string;
  participant_id: string;
  program_id: string;
  current_stage_id: string | null;
  status: string;
  started_on: string;
};

export type AfzwemReadinessCriteriaRow = {
  id: string;
  program_id: string;
  stage_id: string | null;
  code: string;
  name: string;
  description: string | null;
  min_completed_modules: number;
  min_score: number | null;
  status: string;
};

export type AfzwemEventRow = {
  id: string;
  program_id: string;
  stage_id: string | null;
  resource_id: string | null;
  event_type: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  capacity: number;
  status: string;
};

export type AfzwemEventParticipantRow = {
  id: string;
  milestone_event_id: string;
  enrollment_id: string;
  participant_id: string;
  readiness_criteria_id: string | null;
  status: string;
  invited_at: string;
  responded_at: string | null;
  note: string | null;
};

export type AfzwemResultRow = {
  id: string;
  milestone_event_participant_id: string;
  milestone_event_id: string;
  enrollment_id: string;
  participant_id: string;
  program_id: string;
  result_status: string;
  score: number | null;
  note: string | null;
  registered_at: string;
  certificate_id: string | null;
};

export type AfzwemCertificateRow = {
  id: string;
  enrollment_id: string | null;
  participant_id: string;
  program_id: string;
  certificate_number: string | null;
  title: string;
  status: string;
  issued_on: string | null;
  source_event_id: string | null;
  source_result_id: string | null;
  storage_bucket: string;
  file_path: string | null;
  current_version_id: string | null;
  version_number: number;
  file_source: string;
  download_status: string;
  share_token: string | null;
  share_enabled: boolean;
  share_created_at: string | null;
  share_expires_at: string | null;
  share_revoked_at: string | null;
  vault_status: string;
  retention_until: string | null;
  last_downloaded_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
};

export type AfzwemCertificateVersionRow = {
  id: string;
  certificate_id: string;
  version_number: number;
  storage_bucket: string;
  file_path: string;
  file_source: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  original_filename: string | null;
  status: string;
  retention_until: string | null;
  notes: string | null;
  created_at: string;
};

export type AfzwemCertificateAccessEventRow = {
  id: string;
  certificate_id: string;
  certificate_version_id: string | null;
  participant_id: string | null;
  event_type: string;
  access_channel: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type DiplomaReadinessRadarRow = {
  id: string;
  enrollment_id: string;
  participant_id: string;
  program_id: string;
  stage_id: string | null;
  readiness_criteria_id: string | null;
  smart_decision_id: string | null;
  recommended_event_id: string | null;
  milestone_event_participant_id: string | null;
  certificate_id: string | null;
  readiness_status: string;
  score: number | null;
  confidence: string;
  progress_snapshot: Record<string, unknown>;
  attendance_snapshot: Record<string, unknown>;
  badge_snapshot: Record<string, unknown>;
  period_snapshot: Record<string, unknown>;
  criteria_results: Array<Record<string, unknown>>;
  missing_criteria: Array<Record<string, unknown>>;
  reasons: Array<Record<string, unknown>>;
  blockers: Array<Record<string, unknown>>;
  review_note: string | null;
  reviewed_at: string | null;
  last_evaluated_at: string;
};

export type AfzwemEventCandidateSuggestionRow = {
  id: string;
  readiness_radar_id: string;
  milestone_event_id: string;
  enrollment_id: string;
  participant_id: string;
  program_id: string;
  score: number | null;
  confidence: string;
  capacity_snapshot: Record<string, unknown>;
  reasons: Array<Record<string, unknown>>;
  blockers: Array<Record<string, unknown>>;
  suggested_status: string;
  review_note: string | null;
  suggested_at: string;
  reviewed_at: string | null;
};

export type DiplomaReadinessEventRow = {
  id: string;
  readiness_radar_id: string;
  event_type: string;
  note: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type AdminAfzwemData = {
  programs: AfzwemProgramRow[];
  stages: AfzwemStageRow[];
  resources: AfzwemResourceRow[];
  participants: AfzwemParticipantRow[];
  enrollments: AfzwemEnrollmentRow[];
  readinessCriteria: AfzwemReadinessCriteriaRow[];
  events: AfzwemEventRow[];
  eventParticipants: AfzwemEventParticipantRow[];
  results: AfzwemResultRow[];
  certificates: AfzwemCertificateRow[];
  certificateVersions: AfzwemCertificateVersionRow[];
  certificateAccessEvents: AfzwemCertificateAccessEventRow[];
  readinessRadar: DiplomaReadinessRadarRow[];
  candidateSuggestions: AfzwemEventCandidateSuggestionRow[];
  readinessEvents: DiplomaReadinessEventRow[];
};

export type AdminAfzwemSnapshot = {
  status: "ready" | "not_configured" | "no_tenant" | "query_error";
  tenant: {
    id: string;
    name: string;
    slug: string;
    sector: string;
  } | null;
  data: AdminAfzwemData;
  errors: string[];
};

export async function getAdminAfzwemSnapshot(): Promise<AdminAfzwemSnapshot> {
  const selection = await getActiveTenantSelection();
  const context = await getTrustedAuthContext(selection);
  const emptyData = createEmptyData();

  if (context.status !== "authenticated" || !context.activeTenant) {
    return {
      status: "no_tenant",
      tenant: null,
      data: emptyData,
      errors: ["Geen actieve tenant gevonden voor afzwemmen."]
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

  const [
    programsResult,
    stagesResult,
    resourcesResult,
    participantsResult,
    enrollmentsResult,
    readinessCriteriaResult,
    eventsResult,
    eventParticipantsResult,
    resultsResult,
    certificatesResult,
    certificateVersionsResult,
    certificateAccessEventsResult,
    readinessRadarResult,
    candidateSuggestionsResult,
    readinessEventsResult
  ] = await Promise.all([
    supabase.from("programs").select("id, code, name").eq("tenant_id", tenantId).order("name", { ascending: true }),
    supabase.from("stages").select("id, program_id, code, name, sort_order").eq("tenant_id", tenantId).order("sort_order", { ascending: true }),
    supabase.from("resources").select("id, name, location_name, status").eq("tenant_id", tenantId).order("name", { ascending: true }),
    supabase.from("participants").select("id, display_name, birthdate, status").eq("tenant_id", tenantId).order("display_name", { ascending: true }),
    supabase.from("enrollments").select("id, participant_id, program_id, current_stage_id, status, started_on").eq("tenant_id", tenantId).order("started_on", { ascending: false }),
    supabase
      .from("milestone_readiness_criteria")
      .select("id, program_id, stage_id, code, name, description, min_completed_modules, min_score, status")
      .eq("tenant_id", tenantId)
      .order("name", { ascending: true }),
    supabase
      .from("milestone_events")
      .select("id, program_id, stage_id, resource_id, event_type, title, description, starts_at, ends_at, capacity, status")
      .eq("tenant_id", tenantId)
      .order("starts_at", { ascending: false })
      .limit(50),
    supabase
      .from("milestone_event_participants")
      .select("id, milestone_event_id, enrollment_id, participant_id, readiness_criteria_id, status, invited_at, responded_at, note")
      .eq("tenant_id", tenantId)
      .order("invited_at", { ascending: false })
      .limit(100),
    supabase
      .from("milestone_results")
      .select("id, milestone_event_participant_id, milestone_event_id, enrollment_id, participant_id, program_id, result_status, score, note, registered_at, certificate_id")
      .eq("tenant_id", tenantId)
      .order("registered_at", { ascending: false })
      .limit(100),
    supabase
      .from("certificates")
      .select("id, enrollment_id, participant_id, program_id, certificate_number, title, status, issued_on, source_event_id, source_result_id, storage_bucket, file_path, current_version_id, version_number, file_source, download_status, share_token, share_enabled, share_created_at, share_expires_at, share_revoked_at, vault_status, retention_until, last_downloaded_at, revoked_at, revoked_reason")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("certificate_versions")
      .select("id, certificate_id, version_number, storage_bucket, file_path, file_source, mime_type, file_size_bytes, original_filename, status, retention_until, notes, created_at")
      .eq("tenant_id", tenantId)
      .order("version_number", { ascending: false })
      .limit(200),
    supabase
      .from("certificate_access_events")
      .select("id, certificate_id, certificate_version_id, participant_id, event_type, access_channel, metadata, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("diploma_readiness_radar")
      .select("id, enrollment_id, participant_id, program_id, stage_id, readiness_criteria_id, smart_decision_id, recommended_event_id, milestone_event_participant_id, certificate_id, readiness_status, score, confidence, progress_snapshot, attendance_snapshot, badge_snapshot, period_snapshot, criteria_results, missing_criteria, reasons, blockers, review_note, reviewed_at, last_evaluated_at")
      .eq("tenant_id", tenantId)
      .order("score", { ascending: false, nullsFirst: false })
      .limit(120),
    supabase
      .from("afzwem_event_candidate_suggestions")
      .select("id, readiness_radar_id, milestone_event_id, enrollment_id, participant_id, program_id, score, confidence, capacity_snapshot, reasons, blockers, suggested_status, review_note, suggested_at, reviewed_at")
      .eq("tenant_id", tenantId)
      .order("score", { ascending: false, nullsFirst: false })
      .limit(200),
    supabase
      .from("diploma_readiness_events")
      .select("id, readiness_radar_id, event_type, note, metadata, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(100)
  ]);

  const errors = collectErrors({
    programs: programsResult.error,
    stages: stagesResult.error,
    resources: resourcesResult.error,
    participants: participantsResult.error,
    enrollments: enrollmentsResult.error,
    milestone_readiness_criteria: readinessCriteriaResult.error,
    milestone_events: eventsResult.error,
    milestone_event_participants: eventParticipantsResult.error,
    milestone_results: resultsResult.error,
    certificates: certificatesResult.error,
    certificate_versions: certificateVersionsResult.error,
    certificate_access_events: certificateAccessEventsResult.error,
    diploma_readiness_radar: readinessRadarResult.error,
    afzwem_event_candidate_suggestions: candidateSuggestionsResult.error,
    diploma_readiness_events: readinessEventsResult.error
  });

  return {
    status: errors.length > 0 ? "query_error" : "ready",
    tenant,
    errors,
    data: {
      programs: asRows<AfzwemProgramRow>(programsResult.data),
      stages: asRows<AfzwemStageRow>(stagesResult.data),
      resources: asRows<AfzwemResourceRow>(resourcesResult.data),
      participants: asRows<AfzwemParticipantRow>(participantsResult.data),
      enrollments: asRows<AfzwemEnrollmentRow>(enrollmentsResult.data),
      readinessCriteria: asRows<AfzwemReadinessCriteriaRow>(readinessCriteriaResult.data),
      events: asRows<AfzwemEventRow>(eventsResult.data),
      eventParticipants: asRows<AfzwemEventParticipantRow>(eventParticipantsResult.data),
      results: asRows<AfzwemResultRow>(resultsResult.data),
      certificates: asRows<AfzwemCertificateRow>(certificatesResult.data),
      certificateVersions: asRows<AfzwemCertificateVersionRow>(certificateVersionsResult.data),
      certificateAccessEvents: asRows<AfzwemCertificateAccessEventRow>(certificateAccessEventsResult.data),
      readinessRadar: asRows<DiplomaReadinessRadarRow>(readinessRadarResult.data),
      candidateSuggestions: asRows<AfzwemEventCandidateSuggestionRow>(candidateSuggestionsResult.data),
      readinessEvents: asRows<DiplomaReadinessEventRow>(readinessEventsResult.data)
    }
  };
}

function createEmptyData(): AdminAfzwemData {
  return {
    programs: [],
    stages: [],
    resources: [],
    participants: [],
    enrollments: [],
    readinessCriteria: [],
    events: [],
    eventParticipants: [],
    results: [],
    certificates: [],
    certificateVersions: [],
    certificateAccessEvents: [],
    readinessRadar: [],
    candidateSuggestions: [],
    readinessEvents: []
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
