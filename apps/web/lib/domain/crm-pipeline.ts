import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { crmStageMeta, findDuplicateLeads, getCrmSlaState, type CrmPriority, type CrmStage } from "./crm-pipeline-contract";

export type CrmPipelineLead = {
  id: string;
  participantName: string;
  participantBirthDate: string | null;
  parentName: string;
  parentEmail: string;
  parentPhone: string | null;
  programName: string;
  selectedOption: string;
  stage: CrmStage;
  priority: CrmPriority;
  ownerId: string | null;
  ownerName: string;
  nextFollowUpAt: string | null;
  slaDueAt: string | null;
  sla: ReturnType<typeof getCrmSlaState>;
  receivedAt: string;
  stageChangedAt: string;
  sourceLabel: string;
  campaign: string | null;
  scoreBand: string | null;
  scoreConfidence: number | null;
  isConverted: boolean;
  lostReason: string | null;
  contactCount: number;
  lastContactAt: string | null;
};

export type CrmTimelineItem = {
  id: string;
  kind: "contact" | "stage" | "merge";
  title: string;
  description: string;
  occurredAt: string;
  actorName: string;
  tone: "neutral" | "info" | "warning" | "success";
};

export type CrmDuplicateRow = {
  id: string;
  sourceId: string;
  sourceLabel: string;
  candidateId: string;
  candidateLabel: string;
  score: number;
  reasons: string[];
  status: string;
};

export type CrmPipelineData = {
  leads: CrmPipelineLead[];
  owners: Array<{ id: string; label: string }>;
  timeline: CrmTimelineItem[];
  duplicates: CrmDuplicateRow[];
  activeMerge: { id: string; sourceId: string; targetId: string; mergedAt: string } | null;
  selectedLead: CrmPipelineLead | null;
  slaPolicy: {
    firstResponseHours: number;
    followUpHours: number;
    offerFollowUpHours: number;
    trialFollowUpHours: number;
  };
  metrics: {
    active: number;
    overdue: number;
    unassigned: number;
    conversionRate: number;
    pipelineValue: number;
  };
};

export async function getCrmPipelineData(tenantId: string, selectedLeadId?: string | null): Promise<CrmPipelineData> {
  const admin = createAdminClient();
  const leadsResult = await admin
    .from("intake_submissions")
    .select("id, program_id, selected_option, parent_name, parent_email, parent_phone, participant_name, participant_birth_date, crm_stage, crm_priority, lead_owner_user_id, next_follow_up_at, sla_due_at, received_at, stage_changed_at, lost_reason, merged_into_intake_id, is_test")
    .eq("tenant_id", tenantId)
    .eq("is_test", false)
    .order("stage_changed_at", { ascending: false })
    .limit(500);
  assertResult(leadsResult.error, "CRM leads");
  const rawLeads = leadsResult.data ?? [];
  const intakeIds = rawLeads.map((row) => row.id);
  const programIds = [...new Set(rawLeads.map((row) => row.program_id).filter(Boolean))] as string[];
  const ownerIds = [...new Set(rawLeads.map((row) => row.lead_owner_user_id).filter(Boolean))] as string[];

  const [sourcesResult, scoresResult, conversionsResult, contactsResult, programsResult, membershipsResult, policyResult, duplicatesResult, mergesResult] = await Promise.all([
    intakeIds.length
      ? admin.from("lead_sources").select("intake_submission_id, attribution_channel, attribution_source, attribution_campaign").eq("tenant_id", tenantId).in("intake_submission_id", intakeIds)
      : Promise.resolve(emptyResult()),
    intakeIds.length
      ? admin.from("lead_score_snapshots").select("intake_submission_id, score_band, confidence, calculated_at").eq("tenant_id", tenantId).in("intake_submission_id", intakeIds).order("calculated_at", { ascending: false })
      : Promise.resolve(emptyResult()),
    intakeIds.length
      ? admin.from("intake_conversion_lineage").select("intake_submission_id").eq("tenant_id", tenantId).in("intake_submission_id", intakeIds)
      : Promise.resolve(emptyResult()),
    intakeIds.length
      ? admin.from("crm_contact_events").select("id, intake_submission_id, event_type, direction, channel, subject, summary, outcome, occurred_at, recorded_by_user_id").eq("tenant_id", tenantId).in("intake_submission_id", intakeIds).order("occurred_at", { ascending: false })
      : Promise.resolve(emptyResult()),
    programIds.length
      ? admin.from("programs").select("id, name").eq("tenant_id", tenantId).in("id", programIds)
      : Promise.resolve(emptyResult()),
    admin.from("tenant_memberships").select("user_id, invited_email, role").eq("tenant_id", tenantId).eq("status", "active").in("role", ["tenant_owner", "tenant_admin", "tenant_staff"]),
    admin.from("crm_sla_policies").select("first_response_hours, follow_up_hours, offer_follow_up_hours, trial_follow_up_hours").eq("tenant_id", tenantId).maybeSingle(),
    admin.from("crm_duplicate_candidates").select("id, source_intake_id, candidate_intake_id, match_score, match_reasons_json, status").eq("tenant_id", tenantId).order("match_score", { ascending: false }),
    admin.from("crm_merge_events").select("id, source_intake_id, target_intake_id, status, merged_at, reverted_at").eq("tenant_id", tenantId).order("merged_at", { ascending: false })
  ]);
  for (const [error, label] of [
    [sourcesResult.error, "lead sources"],
    [scoresResult.error, "lead scores"],
    [conversionsResult.error, "conversions"],
    [contactsResult.error, "contact events"],
    [programsResult.error, "programs"],
    [membershipsResult.error, "CRM owners"],
    [policyResult.error, "CRM SLA policy"],
    [duplicatesResult.error, "duplicate candidates"],
    [mergesResult.error, "merge history"]
  ] as const) assertResult(error, label);

  const membershipRows = membershipsResult.data ?? [];
  const allOwnerIds = [...new Set([...ownerIds, ...membershipRows.map((row) => row.user_id)])];
  const profilesResult = allOwnerIds.length
    ? await admin.from("profiles").select("id, full_name").in("id", allOwnerIds)
    : emptyResult();
  assertResult(profilesResult.error, "owner profiles");

  const profileById = new Map((profilesResult.data ?? []).map((row) => [row.id, row.full_name]));
  const ownerById = new Map(membershipRows.map((row) => [row.user_id, profileById.get(row.user_id) || row.invited_email || "Onbekende medewerker"]));
  const programById = new Map((programsResult.data ?? []).map((row) => [row.id, row.name]));
  const sourceByIntake = new Map((sourcesResult.data ?? []).map((row) => [row.intake_submission_id, row]));
  type ScoreRow = { intake_submission_id: string; score_band: string; confidence: string | number; calculated_at: string };
  const scoreByIntake = new Map<string, ScoreRow>();
  for (const row of (scoresResult.data ?? []) as ScoreRow[]) if (!scoreByIntake.has(row.intake_submission_id)) scoreByIntake.set(row.intake_submission_id, row);
  const converted = new Set((conversionsResult.data ?? []).map((row) => row.intake_submission_id));
  const contactsByIntake = new Map<string, typeof contactsResult.data>();
  for (const row of contactsResult.data ?? []) contactsByIntake.set(row.intake_submission_id, [...(contactsByIntake.get(row.intake_submission_id) ?? []), row]);

  const leads: CrmPipelineLead[] = rawLeads
    .filter((row) => !row.merged_into_intake_id)
    .map((row) => {
      const source = sourceByIntake.get(row.id);
      const score = scoreByIntake.get(row.id);
      const contacts = contactsByIntake.get(row.id) ?? [];
      const stage = row.crm_stage as CrmStage;
      return {
        id: row.id,
        participantName: row.participant_name,
        participantBirthDate: row.participant_birth_date,
        parentName: row.parent_name,
        parentEmail: row.parent_email,
        parentPhone: row.parent_phone,
        programName: programById.get(row.program_id) ?? "Algemene intake",
        selectedOption: row.selected_option,
        stage,
        priority: row.crm_priority as CrmPriority,
        ownerId: row.lead_owner_user_id,
        ownerName: row.lead_owner_user_id ? ownerById.get(row.lead_owner_user_id) ?? "Onbekende medewerker" : "Niet toegewezen",
        nextFollowUpAt: row.next_follow_up_at,
        slaDueAt: row.sla_due_at,
        sla: getCrmSlaState({ dueAt: row.sla_due_at, stage }),
        receivedAt: row.received_at,
        stageChangedAt: row.stage_changed_at,
        sourceLabel: source ? `${source.attribution_channel} · ${source.attribution_source}` : "Direct/onbekend",
        campaign: source?.attribution_campaign ?? null,
        scoreBand: score?.score_band ?? null,
        scoreConfidence: score ? Number(score.confidence) : null,
        isConverted: converted.has(row.id),
        lostReason: row.lost_reason,
        contactCount: contacts.length,
        lastContactAt: contacts[0]?.occurred_at ?? null
      };
    });

  const selectedLead = leads.find((lead) => lead.id === selectedLeadId) ?? leads[0] ?? null;
  const selectedId = selectedLead?.id ?? null;
  const historyResult = selectedId
    ? await admin.from("crm_pipeline_stage_history").select("id, from_stage, to_stage, reason, changed_by_user_id, occurred_at, source").eq("tenant_id", tenantId).eq("intake_submission_id", selectedId).order("occurred_at", { ascending: false })
    : emptyResult();
  assertResult(historyResult.error, "stage history");

  const actorIds = [...new Set([
    ...(historyResult.data ?? []).map((row) => row.changed_by_user_id),
    ...(selectedId ? contactsByIntake.get(selectedId) ?? [] : []).map((row) => row.recorded_by_user_id)
  ].filter(Boolean))] as string[];
  const actorProfiles = actorIds.length ? await admin.from("profiles").select("id, full_name").in("id", actorIds) : emptyResult();
  assertResult(actorProfiles.error, "timeline actors");
  const actorById = new Map((actorProfiles.data ?? []).map((row) => [row.id, row.full_name || "Medewerker"]));

  const contactTimeline: CrmTimelineItem[] = (selectedId ? contactsByIntake.get(selectedId) ?? [] : []).map((row) => ({
    id: row.id,
    kind: "contact",
    title: contactTitle(row.event_type, row.channel),
    description: row.summary,
    occurredAt: row.occurred_at,
    actorName: row.recorded_by_user_id ? actorById.get(row.recorded_by_user_id) ?? "Medewerker" : "Systeem",
    tone: row.direction === "inbound" ? "info" : "neutral"
  }));
  const stageTimeline: CrmTimelineItem[] = (historyResult.data ?? []).map((row) => ({
    id: row.id,
    kind: "stage",
    title: `Naar ${crmStageMeta[row.to_stage as CrmStage].label}`,
    description: row.reason || `Pipelinefase gewijzigd vanuit ${row.from_stage ? crmStageMeta[row.from_stage as CrmStage].label : "start"}.`,
    occurredAt: row.occurred_at,
    actorName: row.changed_by_user_id ? actorById.get(row.changed_by_user_id) ?? "Medewerker" : row.source === "migration" ? "Migratie" : "Systeem",
    tone: row.to_stage === "placed" ? "success" : row.to_stage === "lost" ? "warning" : "info"
  }));

  const leadLabelById = new Map(rawLeads.map((row) => [row.id, `${row.participant_name} · ${row.parent_name}`]));
  const duplicates: CrmDuplicateRow[] = (duplicatesResult.data ?? []).map((row) => ({
    id: row.id,
    sourceId: row.source_intake_id,
    sourceLabel: leadLabelById.get(row.source_intake_id) ?? "Onbekende lead",
    candidateId: row.candidate_intake_id,
    candidateLabel: leadLabelById.get(row.candidate_intake_id) ?? "Onbekende lead",
    score: row.match_score,
    reasons: Array.isArray(row.match_reasons_json) ? row.match_reasons_json.map(String) : [],
    status: row.status
  }));

  const activeMergeRow = (mergesResult.data ?? []).find((row) => row.status === "active" && (row.source_intake_id === selectedId || row.target_intake_id === selectedId));
  const policy = policyResult.data;
  const active = leads.filter((lead) => !["placed", "lost"].includes(lead.stage));
  const placed = leads.filter((lead) => lead.stage === "placed").length;
  const terminal = placed + leads.filter((lead) => lead.stage === "lost").length;
  return {
    leads,
    owners: membershipRows.map((row) => ({ id: row.user_id, label: ownerById.get(row.user_id) ?? row.invited_email ?? "Medewerker" })).sort((a, b) => a.label.localeCompare(b.label, "nl")),
    timeline: [...contactTimeline, ...stageTimeline].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    duplicates,
    activeMerge: activeMergeRow ? { id: activeMergeRow.id, sourceId: activeMergeRow.source_intake_id, targetId: activeMergeRow.target_intake_id, mergedAt: activeMergeRow.merged_at } : null,
    selectedLead,
    slaPolicy: {
      firstResponseHours: policy?.first_response_hours ?? 24,
      followUpHours: policy?.follow_up_hours ?? 48,
      offerFollowUpHours: policy?.offer_follow_up_hours ?? 24,
      trialFollowUpHours: policy?.trial_follow_up_hours ?? 24
    },
    metrics: {
      active: active.length,
      overdue: active.filter((lead) => lead.sla.status === "overdue").length,
      unassigned: active.filter((lead) => !lead.ownerId).length,
      conversionRate: terminal ? Math.round((placed / terminal) * 100) : 0,
      pipelineValue: leads.filter((lead) => ["trial", "waitlist", "offer"].includes(lead.stage)).length
    }
  };
}

export async function findAndStoreCrmDuplicates(tenantId: string) {
  const admin = createAdminClient();
  const result = await admin
    .from("intake_submissions")
    .select("id, parent_email, parent_phone, parent_name, participant_name, participant_birth_date, received_at, merged_into_intake_id, is_test")
    .eq("tenant_id", tenantId)
    .limit(1000);
  assertResult(result.error, "duplicate source leads");
  const candidates = findDuplicateLeads((result.data ?? []).map((row) => ({
    id: row.id,
    parentEmail: row.parent_email,
    parentPhone: row.parent_phone,
    parentName: row.parent_name,
    participantName: row.participant_name,
    participantBirthDate: row.participant_birth_date,
    receivedAt: row.received_at,
    mergedIntoId: row.merged_into_intake_id,
    isTest: row.is_test
  })));
  if (!candidates.length) return 0;
  const existing = await admin.from("crm_duplicate_candidates").select("source_intake_id, candidate_intake_id").eq("tenant_id", tenantId);
  assertResult(existing.error, "existing duplicate candidates");
  const fingerprints = new Set((existing.data ?? []).map((row) => `${row.source_intake_id}:${row.candidate_intake_id}`));
  const fresh = candidates.filter((candidate) => !fingerprints.has(`${candidate.sourceId}:${candidate.candidateId}`));
  if (!fresh.length) return 0;
  const insert = await admin.from("crm_duplicate_candidates").insert(fresh.map((candidate) => ({
    tenant_id: tenantId,
    source_intake_id: candidate.sourceId,
    candidate_intake_id: candidate.candidateId,
    match_score: candidate.score,
    match_reasons_json: candidate.reasons
  })));
  assertResult(insert.error, "new duplicate candidates");
  return fresh.length;
}

function contactTitle(type: string, channel: string) {
  const labels: Record<string, string> = {
    call: "Telefoongesprek",
    email: "E-mailcontact",
    in_app: "In-app contact",
    meeting: "Persoonlijk gesprek",
    note: "Interne notitie",
    reminder: "Herinnering",
    status_update: "Status bijgewerkt",
    trial: "Proeflescontact"
  };
  return labels[type] ?? `${type} via ${channel}`;
}

function emptyResult() {
  return { data: [], error: null };
}

function assertResult(error: { message: string } | null, label: string): asserts error is null {
  if (error) throw new Error(`Could not load ${label}: ${error.message}`);
}
