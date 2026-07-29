import "server-only";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";
import {
  detectDataQualityIssues,
  type DataQualityFinding,
  type DataQualityIssueStatus,
  type DataQualitySeverity
} from "./data-quality-contract";
import { recordSmartEvent, refreshSmartSignals } from "./smart-events";

export type DataQualityIssueRow = {
  id: string;
  tenant_id: string;
  entity_type: string;
  entity_id: string;
  issue_type: string;
  fingerprint: string;
  severity: DataQualitySeverity;
  title: string;
  description: string;
  suggested_action: string;
  status: DataQualityIssueStatus;
  detected_at: string;
  last_detected_at: string;
  resolved_at: string | null;
  ignored_at: string | null;
  source: string;
  is_test: boolean;
  journey_run_id: string | null;
  metadata_json: Record<string, unknown>;
};

export type DataQualityDashboardData = {
  tenant: { id: string; name: string; slug: string };
  issues: DataQualityIssueRow[];
  lastScanAt: string | null;
};

type MarkerRow = {
  id: string;
  source: string;
  is_test: boolean;
  journey_run_id: string | null;
};

export async function getDataQualityDashboardData(): Promise<DataQualityDashboardData> {
  const context = await requirePrivateShellContext("/admin/automatisering/datakwaliteit");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const [issuesResult, scanResult] = await Promise.all([
    admin
      .from("data_quality_issues")
      .select("id, tenant_id, entity_type, entity_id, issue_type, fingerprint, severity, title, description, suggested_action, status, detected_at, last_detected_at, resolved_at, ignored_at, source, is_test, journey_run_id, metadata_json")
      .eq("tenant_id", tenant.id)
      .order("last_detected_at", { ascending: false })
      .limit(1000),
    admin
      .from("smart_signal_snapshots")
      .select("computed_at")
      .eq("tenant_id", tenant.id)
      .eq("signal_type", "data_quality_scan")
      .eq("entity_type", "tenant")
      .eq("entity_id", tenant.id)
      .maybeSingle()
  ]);

  assertQualityResult(issuesResult.error, "data quality issues");
  assertQualityResult(scanResult.error, "data quality scan status");

  return {
    tenant,
    issues: (issuesResult.data ?? []) as DataQualityIssueRow[],
    lastScanAt: scanResult.data?.computed_at ?? null
  };
}

export async function runDataQualityChecks(tenantId: string) {
  const admin = createAdminClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const [
    participantsResult,
    guardianLinksResult,
    parentMembershipsResult,
    intakesResult,
    waitlistResult,
    offersResult,
    programsResult,
    groupsResult,
    sessionsResult,
    groupAssignmentsResult,
    sessionAssignmentsResult,
    enrollmentsResult,
    membershipsResult,
    subscriptionsResult,
    paymentsResult,
    attendanceResult,
    progressResult,
    badgesResult,
    readinessResult,
    graduationEventsResult,
    graduationParticipantsResult,
    certificatesResult
  ] = await Promise.all([
    admin
      .from("participants")
      .select("id, display_name, birth_date, guardian_user_id, source, is_test, journey_run_id")
      .eq("tenant_id", tenantId),
    admin
      .from("participant_guardians")
      .select("participant_id, guardian_user_id, status")
      .eq("tenant_id", tenantId),
    admin
      .from("tenant_memberships")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .eq("role", "parent")
      .in("status", ["active", "invited"]),
    admin
      .from("intake_submissions")
      .select("id, participant_name, status, source, is_test, journey_run_id")
      .eq("tenant_id", tenantId),
    admin
      .from("waitlist_entries")
      .select("id, intake_submission_id, participant_name, program_id, recommended_stage_id, status, minimum_age_blocked, source, is_test, journey_run_id")
      .eq("tenant_id", tenantId),
    admin
      .from("slot_offers")
      .select("waitlist_entry_id, accepted_participant_id, status")
      .eq("tenant_id", tenantId)
      .eq("status", "accepted"),
    admin.from("programs").select("id, name, status").eq("tenant_id", tenantId),
    admin
      .from("groups")
      .select("id, name, status, default_resource_id")
      .eq("tenant_id", tenantId),
    admin
      .from("sessions")
      .select("id, group_id, resource_id, starts_at, status, source, is_test, journey_run_id")
      .eq("tenant_id", tenantId),
    admin
      .from("group_instructor_assignments")
      .select("group_id, status, starts_on, ends_on")
      .eq("tenant_id", tenantId),
    admin
      .from("session_instructor_assignments")
      .select("session_id, status")
      .eq("tenant_id", tenantId),
    admin
      .from("enrollments")
      .select("id, participant_id, program_id, status, source, is_test, journey_run_id")
      .eq("tenant_id", tenantId),
    admin
      .from("group_memberships")
      .select("id, participant_id, group_id, status, starts_on, ends_on, source, is_test, journey_run_id")
      .eq("tenant_id", tenantId),
    admin
      .from("subscriptions")
      .select("id, participant_id, guardian_user_id, status")
      .eq("tenant_id", tenantId),
    admin
      .from("manual_payments")
      .select("id, participant_id, guardian_user_id, status")
      .eq("tenant_id", tenantId),
    admin
      .from("session_attendance")
      .select("id, source, is_test, journey_run_id")
      .eq("tenant_id", tenantId),
    admin
      .from("participant_progress_scores")
      .select("id, source, is_test, journey_run_id")
      .eq("tenant_id", tenantId),
    admin
      .from("participant_badge_awards")
      .select("id, source, is_test, journey_run_id")
      .eq("tenant_id", tenantId),
    admin
      .from("graduation_readiness")
      .select("id, source, is_test, journey_run_id")
      .eq("tenant_id", tenantId),
    admin
      .from("graduation_events")
      .select("id, source, is_test, journey_run_id")
      .eq("tenant_id", tenantId),
    admin
      .from("graduation_event_participants")
      .select("id, source, is_test, journey_run_id")
      .eq("tenant_id", tenantId),
    admin
      .from("certificate_records")
      .select("id, source, is_test, journey_run_id")
      .eq("tenant_id", tenantId)
  ]);

  const results = [
    ["participants", participantsResult],
    ["guardian links", guardianLinksResult],
    ["parent memberships", parentMembershipsResult],
    ["intakes", intakesResult],
    ["waitlist", waitlistResult],
    ["slot offers", offersResult],
    ["programs", programsResult],
    ["groups", groupsResult],
    ["sessions", sessionsResult],
    ["group instructor assignments", groupAssignmentsResult],
    ["session instructor assignments", sessionAssignmentsResult],
    ["enrollments", enrollmentsResult],
    ["group memberships", membershipsResult],
    ["subscriptions", subscriptionsResult],
    ["payments", paymentsResult],
    ["attendance", attendanceResult],
    ["progress", progressResult],
    ["badges", badgesResult],
    ["graduation readiness", readinessResult],
    ["graduation events", graduationEventsResult],
    ["graduation participants", graduationParticipantsResult],
    ["certificates", certificatesResult]
  ] as const;
  for (const [label, result] of results) assertQualityResult(result.error, label);

  const participants = (participantsResult.data ?? []) as Array<MarkerRow & {
    display_name: string;
    birth_date: string | null;
    guardian_user_id: string | null;
  }>;
  const guardianLinks = (guardianLinksResult.data ?? []) as Array<{
    participant_id: string;
    guardian_user_id: string;
    status: string;
  }>;
  const guardianIds = new Set<string>([
    ...guardianLinks.map((link) => link.guardian_user_id),
    ...participants.flatMap((participant) => participant.guardian_user_id ? [participant.guardian_user_id] : []),
    ...(parentMembershipsResult.data ?? []).map((membership) => membership.user_id)
  ]);
  const profilesResult = guardianIds.size
    ? await admin.from("profiles").select("id, full_name, email, phone").in("id", [...guardianIds])
    : { data: [], error: null };
  assertQualityResult(profilesResult.error, "guardian profiles");

  const profiles = (profilesResult.data ?? []) as Array<{
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
  }>;
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const participantById = new Map(participants.map((participant) => [participant.id, participant]));
  const groups = (groupsResult.data ?? []) as Array<{
    id: string;
    name: string;
    status: string;
    default_resource_id: string | null;
  }>;
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const sessions = (sessionsResult.data ?? []) as Array<MarkerRow & {
    group_id: string;
    resource_id: string | null;
    starts_at: string;
    status: string;
  }>;
  const futureSessions = sessions.filter((session) => session.status === "scheduled" && session.starts_at >= now.toISOString());
  const futureSessionIds = new Set(futureSessions.map((session) => session.id));
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const groupIdsWithSessionInstructor = new Set(
    ((sessionAssignmentsResult.data ?? []) as Array<{ session_id: string; status: string }>)
      .filter((assignment) => assignment.status === "active" && futureSessionIds.has(assignment.session_id))
      .flatMap((assignment) => sessionById.get(assignment.session_id)?.group_id ?? [])
  );
  const groupIdsWithInstructor = new Set(
    ((groupAssignmentsResult.data ?? []) as Array<{ group_id: string; status: string; starts_on: string | null; ends_on: string | null }>)
      .filter((assignment) =>
        assignment.status === "active" &&
        (!assignment.starts_on || assignment.starts_on <= today) &&
        (!assignment.ends_on || assignment.ends_on >= today)
      )
      .map((assignment) => assignment.group_id)
  );
  const groupIdsWithResource = new Set(futureSessions.filter((session) => !!session.resource_id).map((session) => session.group_id));
  const acceptedParticipantByIntake = new Map<string, string>();
  const waitlistRows = (waitlistResult.data ?? []) as Array<MarkerRow & {
    intake_submission_id: string | null;
    participant_name: string;
    program_id: string | null;
    recommended_stage_id: string | null;
    status: string;
    minimum_age_blocked: boolean;
  }>;
  const waitlistById = new Map(waitlistRows.map((entry) => [entry.id, entry]));
  for (const offer of (offersResult.data ?? []) as Array<{ waitlist_entry_id: string; accepted_participant_id: string | null; status: string }>) {
    const intakeId = waitlistById.get(offer.waitlist_entry_id)?.intake_submission_id;
    if (intakeId && offer.accepted_participant_id) acceptedParticipantByIntake.set(intakeId, offer.accepted_participant_id);
  }
  const enrollmentRows = (enrollmentsResult.data ?? []) as Array<MarkerRow & {
    participant_id: string;
    program_id: string | null;
    status: string;
  }>;
  const membershipRows = (membershipsResult.data ?? []) as Array<MarkerRow & {
    participant_id: string;
    group_id: string;
    status: string;
    starts_on: string | null;
    ends_on: string | null;
  }>;

  const findings = detectDataQualityIssues({
    now: now.toISOString(),
    guardians: [...guardianIds].map((guardianId) => {
      const profile = profileById.get(guardianId);
      return {
        id: guardianId,
        name: profile?.full_name ?? null,
        email: profile?.email ?? null,
        phone: profile?.phone ?? null,
        profileExists: !!profile
      };
    }),
    participantGuardians: guardianLinks.map((link) => ({
      participantId: link.participant_id,
      guardianId: link.guardian_user_id,
      status: link.status
    })),
    participants: participants.map((participant) => ({
      id: participant.id,
      name: participant.display_name,
      birthDate: participant.birth_date,
      guardianUserId: participant.guardian_user_id,
      source: participant.source,
      isTest: participant.is_test,
      journeyRunId: participant.journey_run_id
    })),
    intakes: ((intakesResult.data ?? []) as Array<MarkerRow & { participant_name: string; status: string }>).map((intake) => ({
      id: intake.id,
      participantName: intake.participant_name,
      status: intake.status,
      hasConvertedParticipant: acceptedParticipantByIntake.has(intake.id),
      source: intake.source,
      isTest: intake.is_test,
      journeyRunId: intake.journey_run_id
    })),
    waitlistEntries: waitlistRows.map((entry) => ({
      id: entry.id,
      participantName: entry.participant_name,
      programId: entry.program_id,
      stageId: entry.recommended_stage_id,
      status: entry.status,
      minimumAgeBlocked: entry.minimum_age_blocked,
      source: entry.source,
      isTest: entry.is_test,
      journeyRunId: entry.journey_run_id
    })),
    programs: ((programsResult.data ?? []) as Array<{ id: string; name: string; status: string }>).map((program) => program),
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      status: group.status,
      resourceId: group.default_resource_id,
      hasEffectiveResource: groupIdsWithResource.has(group.id),
      hasEffectiveInstructor: groupIdsWithInstructor.has(group.id) || groupIdsWithSessionInstructor.has(group.id)
    })),
    sessions: sessions.map((session) => ({
      id: session.id,
      label: `${groupById.get(session.group_id)?.name ?? "Onbekende groep"} · ${session.starts_at}`,
      groupId: session.group_id,
      source: session.source,
      isTest: session.is_test,
      journeyRunId: session.journey_run_id
    })),
    enrollments: enrollmentRows.map((enrollment) => ({
      id: enrollment.id,
      participantId: enrollment.participant_id,
      participantName: participantById.get(enrollment.participant_id)?.display_name ?? "Onbekende leerling",
      programId: enrollment.program_id,
      status: enrollment.status,
      source: enrollment.source,
      isTest: enrollment.is_test,
      journeyRunId: enrollment.journey_run_id
    })),
    memberships: membershipRows.map((membership) => ({
      id: membership.id,
      participantId: membership.participant_id,
      participantName: participantById.get(membership.participant_id)?.display_name ?? "Onbekende leerling",
      groupId: membership.group_id,
      groupName: groupById.get(membership.group_id)?.name ?? "Onbekende groep",
      status: membership.status,
      startsOn: membership.starts_on,
      endsOn: membership.ends_on,
      source: membership.source,
      isTest: membership.is_test,
      journeyRunId: membership.journey_run_id
    })),
    financialRecords: [
      ...((subscriptionsResult.data ?? []) as Array<{ id: string; participant_id: string; guardian_user_id: string | null; status: string }>).map((subscription) => ({
        id: subscription.id,
        kind: "subscription" as const,
        participantId: subscription.participant_id,
        participantName: participantById.get(subscription.participant_id)?.display_name ?? "Onbekende leerling",
        guardianId: subscription.guardian_user_id,
        status: subscription.status
      })),
      ...((paymentsResult.data ?? []) as Array<{ id: string; participant_id: string; guardian_user_id: string | null; status: string }>).map((payment) => ({
        id: payment.id,
        kind: "payment" as const,
        participantId: payment.participant_id,
        participantName: participantById.get(payment.participant_id)?.display_name ?? "Onbekende leerling",
        guardianId: payment.guardian_user_id,
        status: payment.status
      }))
    ],
    journeyRecords: [
      ...markerRecords("participant", participants, (record) => record.display_name),
      ...markerRecords("intake_submission", (intakesResult.data ?? []) as MarkerRow[], () => "Intake"),
      ...markerRecords("waitlist_entry", waitlistRows, (record) => record.participant_name),
      ...markerRecords("enrollment", enrollmentRows, (record) => participantById.get(record.participant_id)?.display_name ?? "Inschrijving"),
      ...markerRecords("group_membership", membershipRows, (record) => participantById.get(record.participant_id)?.display_name ?? "Groepsplaatsing"),
      ...markerRecords("session", sessions, (record) => groupById.get(record.group_id)?.name ?? "Sessie"),
      ...markerRecords("session_attendance", (attendanceResult.data ?? []) as MarkerRow[], () => "Presentieregistratie"),
      ...markerRecords("progress_score", (progressResult.data ?? []) as MarkerRow[], () => "Voortgangsscore"),
      ...markerRecords("badge_award", (badgesResult.data ?? []) as MarkerRow[], () => "Badge"),
      ...markerRecords("graduation_readiness", (readinessResult.data ?? []) as MarkerRow[], () => "Afzwemgereedheid"),
      ...markerRecords("graduation_event", (graduationEventsResult.data ?? []) as MarkerRow[], () => "Afzwemevent"),
      ...markerRecords("graduation_event_participant", (graduationParticipantsResult.data ?? []) as MarkerRow[], () => "Afzwemdeelname"),
      ...markerRecords("certificate", (certificatesResult.data ?? []) as MarkerRow[], () => "Diploma")
    ]
  });

  const persisted = await persistFindings(tenantId, findings, now.toISOString());
  const signalResult = await refreshSmartSignals(tenantId);
  const severityCounts = countBy(findings, (finding) => finding.severity);
  const snapshotWrite = await admin
    .from("smart_signal_snapshots")
    .upsert({
      tenant_id: tenantId,
      signal_type: "data_quality_scan",
      entity_type: "tenant",
      entity_id: tenantId,
      score: findings.length,
      status: findings.some((finding) => finding.severity === "critical")
        ? "critical"
        : findings.some((finding) => finding.severity === "error")
          ? "attention"
          : "healthy",
      reasons_json: [
        {
          total: findings.length,
          critical: severityCounts.critical ?? 0,
          error: severityCounts.error ?? 0,
          warning: severityCounts.warning ?? 0,
          info: severityCounts.info ?? 0
        }
      ],
      computed_at: now.toISOString(),
      expires_at: null
    }, { onConflict: "tenant_id,signal_type,entity_type,entity_id" });
  assertQualityResult(snapshotWrite.error, "data quality scan snapshot");

  return {
    detected: findings.length,
    createdOrReopened: persisted.createdOrReopened,
    autoResolved: persisted.autoResolved,
    signalsComputed: signalResult.snapshotsComputed,
    smartEventsCreated: persisted.eventsCreated + signalResult.eventsCreated
  };
}

async function persistFindings(tenantId: string, findings: DataQualityFinding[], detectedAt: string) {
  const admin = createAdminClient();
  const existingResult = await admin
    .from("data_quality_issues")
    .select("id, fingerprint, status, ignored_at, ignored_by_user_id")
    .eq("tenant_id", tenantId);
  assertQualityResult(existingResult.error, "existing data quality issues");
  const existing = (existingResult.data ?? []) as Array<{
    id: string;
    fingerprint: string;
    status: DataQualityIssueStatus;
    ignored_at: string | null;
    ignored_by_user_id: string | null;
  }>;
  const existingByFingerprint = new Map(existing.map((issue) => [issue.fingerprint, issue]));
  const detectedFingerprints = new Set(findings.map((finding) => finding.fingerprint));
  const rows = findings.map((finding) => {
    const previous = existingByFingerprint.get(finding.fingerprint);
    const ignored = previous?.status === "ignored";
    return {
      tenant_id: tenantId,
      entity_type: finding.entityType,
      entity_id: finding.entityId,
      issue_type: finding.issueType,
      fingerprint: finding.fingerprint,
      severity: finding.severity,
      title: finding.title,
      description: finding.description,
      suggested_action: finding.suggestedAction,
      status: ignored ? "ignored" : "open",
      detected_at: previous ? undefined : detectedAt,
      last_detected_at: detectedAt,
      resolved_at: null,
      resolved_by_user_id: null,
      ignored_at: ignored ? previous.ignored_at : null,
      ignored_by_user_id: ignored ? previous.ignored_by_user_id : null,
      source: finding.isTest ? "journey_simulation_bot" : "data_quality_assistant",
      is_test: finding.isTest,
      journey_run_id: finding.journeyRunId,
      metadata_json: finding.metadata
    };
  });

  const persistedRows = rows.length
    ? await admin
        .from("data_quality_issues")
        .upsert(rows, { onConflict: "tenant_id,fingerprint" })
        .select("id, fingerprint, status")
    : { data: [], error: null };
  assertQualityResult(persistedRows.error, "detected data quality issues");

  const staleIds = existing
    .filter((issue) => issue.status === "open" && !detectedFingerprints.has(issue.fingerprint))
    .map((issue) => issue.id);
  if (staleIds.length > 0) {
    const staleResult = await admin
      .from("data_quality_issues")
      .update({
        status: "auto_resolved",
        resolved_at: detectedAt,
        resolved_by_user_id: null,
        ignored_at: null,
        ignored_by_user_id: null
      })
      .eq("tenant_id", tenantId)
      .in("id", staleIds);
    assertQualityResult(staleResult.error, "auto-resolved data quality issues");
  }

  const persistedByFingerprint = new Map(
    ((persistedRows.data ?? []) as Array<{ id: string; fingerprint: string; status: string }>).map((issue) => [issue.fingerprint, issue])
  );
  const openedFindings = findings.filter((finding) => {
    const previous = existingByFingerprint.get(finding.fingerprint);
    return !previous || ["resolved", "auto_resolved"].includes(previous.status);
  });
  let eventsCreated = 0;

  for (const finding of openedFindings) {
    const issue = persistedByFingerprint.get(finding.fingerprint);
    if (!issue || issue.status !== "open") continue;
    const event = await recordSmartEvent({
      tenantId,
      eventType: "data_quality_issue_created",
      entityType: "data_quality_issue",
      entityId: issue.id,
      participantId: typeof finding.metadata.participantId === "string" ? finding.metadata.participantId : null,
      severity: finding.severity,
      source: finding.isTest ? "journey_simulation_bot" : "data_quality_assistant",
      isTest: finding.isTest,
      journeyRunId: finding.journeyRunId,
      dedupeKey: `data-quality-open:${issue.id}:${detectedAt}`,
      metadata: {
        issueType: finding.issueType,
        affectedEntityType: finding.entityType,
        affectedEntityId: finding.entityId,
        confidence: finding.metadata.confidence,
        reason: finding.description
      }
    });
    if (event.ok && !event.duplicate) eventsCreated += 1;
  }

  return {
    autoResolved: staleIds.length,
    createdOrReopened: openedFindings.length,
    eventsCreated
  };
}

function markerRecords<Row extends MarkerRow>(
  entityType: string,
  rows: Row[],
  label: (row: Row) => string
) {
  return rows.map((row) => ({
    id: row.id,
    entityType,
    entityLabel: label(row),
    source: row.source,
    isTest: row.is_test,
    journeyRunId: row.journey_run_id
  }));
}

function countBy<Row, Key extends string>(rows: Row[], key: (row: Row) => Key) {
  const counts: Partial<Record<Key, number>> = {};
  for (const row of rows) {
    const value = key(row);
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function assertQualityResult(error: { message: string } | null, label: string) {
  if (error) {
    throw new Error(`Could not load or persist ${label}: ${error.message}`);
  }
}
