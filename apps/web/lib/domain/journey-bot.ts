import "server-only";

import { randomUUID } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  calculateJourneyRunAllowance,
  chooseNextRunAt,
  getJourneyConfigStopReason,
  getMinimumAgeDecision,
  isActiveJourneyWindow,
  isJourneyBotEnvironmentAllowed,
  normalizeJourneyBotEnvironment,
  resolveScenarioMode,
  resolveStressVariant,
  summarizeJourneyRun,
  type JourneyBotEnvironment,
  type JourneyExecutionOutcome,
  type JourneyIssueSummary,
  type JourneyOutcomeClassification,
  type JourneyScenarioMode,
  type JourneyStressVariant
} from "./journey-bot-contract";
import { computePlacementScores, type WaitlistEntryRow, type WaitlistPreferenceRow } from "./placement";
import type { GroupMembershipRow, GroupRow } from "./core";

const SOURCE = "journey_simulation_bot";
const MINIMUM_AGE = 4;
const childFirstNames = ["Emma", "Mila", "Sophie", "Tess", "Noor", "Lotte", "Sara", "Yara", "Julia", "Fenna", "Daan", "Noah", "Sem", "Luuk", "Levi", "Milan", "Mees", "Finn", "Sam", "Bram"];
const childLastNames = ["De Jong", "Jansen", "De Vries", "Van den Berg", "Bakker", "Visser", "Smit", "Meijer", "Mulder", "Bos", "Vos", "Peters", "Hendriks", "Van Dijk", "Kuiper"];
const guardianNames = ["Lisa de Jong", "Mark Jansen", "Sanne Bakker", "Thomas Visser", "Nadia van Dijk", "Kevin Mulder", "Fatima El Amrani", "Youssef Ait Said", "Anouk Meijer", "Dennis Bos"];
const streets = ["Keizerstraat", "Tholensestraat", "Nieboerweg", "Stevinstraat", "Laan van Meerdervoort", "Leyweg", "Loosduinse Hoofdstraat", "Rijswijkseweg", "Theresiastraat", "Badhuisstraat"];
const districts = ["Scheveningen", "Duindorp", "Benoordenhout", "Bezuidenhout", "Centrum", "Laak", "Loosduinen", "Escamp", "Ypenburg", "Wateringse Veld", "Mariahoeve", "Segbroek"];

export type JourneyBotConfigRow = {
  id: string;
  environment: JourneyBotEnvironment;
  tenant_id: string;
  enabled: boolean;
  paused: boolean;
  scenario_mode: JourneyScenarioMode;
  min_interval_minutes: number;
  max_interval_minutes: number;
  max_journeys_per_run: number;
  max_active_journeys: number;
  max_journeys_per_day: number;
  active_days_json: unknown;
  active_time_windows_json: unknown;
  program_ids_json: unknown;
  run_speed: string;
  suppress_external_notifications: boolean;
  suppress_real_payments: boolean;
  use_fallback_placement: boolean;
  cleanup_after_days: number;
  journeys_started_total: number;
  budget_started_at: string;
  run_until: string | null;
  stop_after_journeys: number | null;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  lock_token: string | null;
  locked_at: string | null;
};

type JourneyExecutionResult = JourneyExecutionOutcome & {
  journeyId: string;
};

type ProgramRow = { code: string | null; id: string; name: string };
type StageRow = { code: string | null; id: string; name: string; program_id: string; sort_order: number };
type JourneyRow = {
  id: string;
  run_id: string;
  tenant_id: string;
  participant_id: string | null;
  intake_submission_id: string | null;
  waitlist_entry_id: string | null;
  enrollment_id: string | null;
  guardian_id: string | null;
  current_program_id: string | null;
  current_stage_id: string | null;
  current_group_id: string | null;
  child_display_name: string;
  guardian_display_name: string;
  smoke_run_id: string;
  summary_log: string;
};

export function getJourneyBotEnvironmentStatus() {
  const environment = normalizeJourneyBotEnvironment(process.env.APP_ENV);
  const allowProduction = process.env.ALLOW_JOURNEY_BOT_IN_PRODUCTION === "true";

  return {
    allowProduction,
    allowed: isJourneyBotEnvironmentAllowed(environment, allowProduction),
    environment
  };
}

export async function getJourneyBotDashboardData() {
  const admin = createAdminClient();
  const [tenantsResult, programsResult, configsResult, runsResult, journeysResult, eventsResult, issuesResult] = await Promise.all([
    admin.from("tenants").select("id, name, slug, status").eq("status", "active").order("name"),
    admin.from("programs").select("id, tenant_id, name, code, status").eq("status", "active").order("sort_order"),
    admin.from("journey_bot_configs").select("*").order("updated_at", { ascending: false }),
    admin.from("journey_bot_runs").select("*").order("started_at", { ascending: false }).limit(10),
    admin.from("journey_bot_child_journeys").select("*").order("started_at", { ascending: false }).limit(20),
    admin.from("journey_bot_child_events").select("*").order("created_at", { ascending: false }).limit(60),
    admin.from("journey_bot_issues").select("*").order("created_at", { ascending: false }).limit(100)
  ]);

  assertNoError(tenantsResult.error, "tenants");
  assertNoError(programsResult.error, "programs");
  assertNoError(configsResult.error, "journey bot configs");
  assertNoError(runsResult.error, "journey bot runs");
  assertNoError(journeysResult.error, "journey bot journeys");
  assertNoError(eventsResult.error, "journey bot events");
  assertNoError(issuesResult.error, "journey bot issues");

  return {
    environment: getJourneyBotEnvironmentStatus(),
    tenants: tenantsResult.data ?? [],
    programs: programsResult.data ?? [],
    configs: (configsResult.data ?? []) as JourneyBotConfigRow[],
    runs: runsResult.data ?? [],
    journeys: journeysResult.data ?? [],
    events: eventsResult.data ?? [],
    issues: issuesResult.data ?? []
  };
}

export async function runDueJourneyBotConfigs() {
  const environment = requireAllowedEnvironment();
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("journey_bot_configs")
    .select("*")
    .eq("environment", environment)
    .eq("enabled", true)
    .eq("paused", false)
    .or(`next_run_at.is.null,next_run_at.lte.${now}`)
    .order("next_run_at", { ascending: true, nullsFirst: true });

  assertNoError(error, "due journey bot configs");
  const results = [];

  for (const config of (data ?? []) as JourneyBotConfigRow[]) {
    const stopReason = getJourneyConfigStopReason({
      journeysStartedTotal: config.journeys_started_total,
      runUntil: config.run_until,
      stopAfterJourneys: config.stop_after_journeys
    });
    if (stopReason) {
      await stopJourneyBotConfig(config, stopReason);
      continue;
    }
    if (!isConfigWithinSchedule(config)) continue;
    results.push(await runJourneyBotConfig(config.id, { ignoreSchedule: false, requestedBy: null }));
  }

  return results;
}

export async function runJourneyBotConfig(
  configId: string,
  options: { ignoreSchedule?: boolean; requestedBy?: string | null } = {}
) {
  const environment = requireAllowedEnvironment();
  const admin = createAdminClient();
  const config = await getConfig(configId);

  if (config.environment !== environment) throw new Error("Journey Bot config belongs to a different environment.");
  if (!config.enabled || config.paused) throw new Error("Journey Bot config is disabled or paused.");
  if (!config.suppress_external_notifications || !config.suppress_real_payments) {
    throw new Error("Journey Bot safety switches must suppress notifications and real payments.");
  }
  if (!options.ignoreSchedule && !isConfigWithinSchedule(config)) return { configId, skipped: true, reason: "outside_schedule" };

  const lockToken = randomUUID();
  const claimResult = await admin.rpc("claim_journey_bot_config", {
    target_config_id: config.id,
    target_lock_token: lockToken,
    lock_timeout_seconds: 900
  });
  assertNoError(claimResult.error, "claim journey bot config");
  if (!claimResult.data) return { configId, skipped: true, reason: "locked" };

  let runId: string | null = null;

  try {
    const claimedConfig = await getConfig(configId);
    if (claimedConfig.lock_token !== lockToken) return { configId, skipped: true, reason: "lock_lost" };
    const stopReason = getJourneyConfigStopReason({
      journeysStartedTotal: claimedConfig.journeys_started_total,
      runUntil: claimedConfig.run_until,
      stopAfterJourneys: claimedConfig.stop_after_journeys
    });
    if (stopReason) {
      await stopJourneyBotConfig(claimedConfig, stopReason, lockToken);
      return { configId, skipped: true, reason: stopReason };
    }
    const allowance = await getRunAllowance(claimedConfig);
    if (allowance.allowance <= 0) {
      if (allowance.stopRemaining <= 0) {
        await stopJourneyBotConfig(claimedConfig, "journey_limit_reached", lockToken);
      } else {
        await releaseConfig(claimedConfig, lockToken, "limited", null, 0);
      }
      return {
        configId,
        limits: allowance,
        skipped: true,
        reason: allowance.stopRemaining <= 0 ? "journey_limit_reached" : "limit_reached"
      };
    }

    const runResult = await admin
      .from("journey_bot_runs")
      .insert({
        config_id: config.id,
        tenant_id: config.tenant_id,
        environment,
        scenario_mode: config.scenario_mode,
        status: "running",
        metadata_json: {
          requestedBy: options.requestedBy ?? "cron",
          safeMode: true,
          sequenceStart: claimedConfig.journeys_started_total,
          suppressExternalNotifications: true,
          suppressRealPayments: true
        }
      })
      .select("id")
      .single();
    assertNoError(runResult.error, "create journey bot run");
    const createdRunId = runResult.data.id as string;
    runId = createdRunId;

    const outcomes: JourneyExecutionResult[] = [];
    for (let ordinal = 0; ordinal < allowance.allowance; ordinal += 1) {
      try {
        outcomes.push(
          await runChildJourney({
            config: claimedConfig,
            ordinal,
            runId: createdRunId,
            sequence: claimedConfig.journeys_started_total + ordinal
          })
        );
      } catch (error) {
        await createIssue({
          config: claimedConfig,
          context: { ordinal },
          issueType: "unexpected_exception",
          message: getErrorMessage(error),
          runId: createdRunId,
          severity: "error",
          step: "run_child_journey"
        });
        outcomes.push({ classification: "technical_failure", journeyId: "unavailable", status: "failed" });
      }
    }

    const issueSummary = await getRunIssueSummary(createdRunId);
    const summary = summarizeJourneyRun(outcomes, issueSummary);
    const issueCount = issueSummary.info + issueSummary.warning + issueSummary.error + issueSummary.critical;
    await admin
      .from("journey_bot_runs")
      .update({
        completed_count: summary.completed,
        degraded_count: summary.degraded,
        expected_blocked_count: summary.expectedBlocked,
        failed_count: summary.failed,
        finished_at: new Date().toISOString(),
        health_status: summary.healthStatus,
        issue_count: issueCount,
        issue_summary_json: issueSummary,
        passed_count: summary.passed,
        started_count: allowance.allowance,
        status: summary.status,
        technical_failure_count: summary.technicalFailures,
        unexpected_issue_count: issueSummary.unexpected
      })
      .eq("id", createdRunId);
    await releaseConfig(
      claimedConfig,
      lockToken,
      summary.status,
      summary.technicalFailures ? `${summary.technicalFailures} technische journey-fout(en).` : null,
      allowance.allowance
    );

    return {
      ...summary,
      configId,
      issueCount,
      limits: allowance,
      runId,
      skipped: false
    };
  } catch (error) {
    const message = getErrorMessage(error);
    if (runId) {
      await Promise.all([
        admin.from("journey_bot_runs").update({ error_message: message, finished_at: new Date().toISOString(), status: "failed" }).eq("id", runId),
        createIssue({ config, issueType: "unexpected_exception", message, runId, severity: "critical", step: "run_orchestration" })
      ]);
    }
    await releaseConfig(config, lockToken, "failed", message, 0);
    throw error;
  }
}

export async function archiveJourneyBotRun(runId: string, actorUserId: string) {
  requireAllowedEnvironment();
  const admin = createAdminClient();
  const { data: journeys, error } = await admin
    .from("journey_bot_child_journeys")
    .select("id, tenant_id, participant_id, intake_submission_id, waitlist_entry_id, enrollment_id")
    .eq("run_id", runId);
  assertNoError(error, "journeys for archive");
  const archivedAt = new Date().toISOString();
  const reason = `journey_bot_cleanup:${actorUserId}`;

  for (const journey of journeys ?? []) {
    await Promise.all([
      journey.intake_submission_id
        ? admin.from("intake_submissions").update({ archived_at: archivedAt, archived_reason: reason, status: "closed" }).eq("id", journey.intake_submission_id).eq("is_test", true).eq("source", SOURCE)
        : Promise.resolve(),
      journey.waitlist_entry_id
        ? admin.from("waitlist_entries").update({ archived_at: archivedAt, archived_reason: reason, status: "closed" }).eq("id", journey.waitlist_entry_id).eq("is_test", true).eq("source", SOURCE)
        : Promise.resolve(),
      journey.enrollment_id
        ? admin.from("enrollments").update({ archived_at: archivedAt, archived_reason: reason, ends_on: archivedAt.slice(0, 10), status: "cancelled" }).eq("id", journey.enrollment_id).eq("is_test", true).eq("source", SOURCE)
        : Promise.resolve(),
      journey.participant_id
        ? admin.from("participants").update({ archived_at: archivedAt, archived_reason: reason, status: "archived" }).eq("id", journey.participant_id).eq("is_test", true).eq("source", SOURCE)
        : Promise.resolve(),
      journey.participant_id
        ? admin.from("group_memberships").update({ archived_at: archivedAt, archived_reason: reason, ends_on: archivedAt.slice(0, 10), status: "cancelled" }).eq("participant_id", journey.participant_id).eq("is_test", true).eq("source", SOURCE)
        : Promise.resolve(),
      journey.participant_id
        ? admin.from("participant_progress_scores").update({ status: "archived" }).eq("participant_id", journey.participant_id).eq("is_test", true).eq("source", SOURCE)
        : Promise.resolve(),
      journey.participant_id
        ? admin.from("participant_badge_awards").update({ status: "revoked" }).eq("participant_id", journey.participant_id).eq("is_test", true).eq("source", SOURCE)
        : Promise.resolve(),
      journey.participant_id
        ? admin.from("certificate_records").update({ status: "revoked" }).eq("participant_id", journey.participant_id).eq("is_test", true).eq("source", SOURCE)
        : Promise.resolve()
    ]);
  }

  await admin
    .from("journey_bot_child_journeys")
    .update({ archived_at: archivedAt, archived_reason: reason, journey_status: "archived" })
    .eq("run_id", runId);

  return { archivedJourneys: journeys?.length ?? 0 };
}

export async function stopAllJourneyBots(actorUserId: string) {
  const environment = requireAllowedEnvironment();
  const admin = createAdminClient();
  const now = new Date().toISOString();

  await Promise.all([
    admin.from("journey_bot_configs").update({ enabled: false, paused: true, updated_by: actorUserId, lock_token: null, locked_at: null }).eq("environment", environment),
    admin.from("journey_bot_runs").update({ finished_at: now, status: "stopped" }).eq("environment", environment).eq("status", "running"),
    admin.from("journey_bot_child_journeys").update({ finished_at: now, journey_status: "stopped" }).eq("environment", environment).eq("journey_status", "running")
  ]);
}

export async function resetJourneyBotTestCycle(configId: string, actorUserId: string) {
  const environment = requireAllowedEnvironment();
  const admin = createAdminClient();
  const config = await getConfig(configId);
  if (config.environment !== environment) throw new Error("Journey Bot config belongs to a different environment.");
  const archivedAt = new Date().toISOString();
  const reason = `journey_bot_test_cycle_reset:${actorUserId}`;
  const [memberships, enrollments, runningJourneys] = await Promise.all([
    admin
      .from("group_memberships")
      .update({ archived_at: archivedAt, archived_reason: reason, ends_on: archivedAt.slice(0, 10), status: "cancelled" })
      .eq("tenant_id", config.tenant_id)
      .eq("is_test", true)
      .eq("source", SOURCE)
      .eq("status", "active")
      .select("id"),
    admin
      .from("enrollments")
      .update({ archived_at: archivedAt, archived_reason: reason, ends_on: archivedAt.slice(0, 10), status: "cancelled" })
      .eq("tenant_id", config.tenant_id)
      .eq("is_test", true)
      .eq("source", SOURCE)
      .eq("status", "active")
      .select("id"),
    admin
      .from("journey_bot_child_journeys")
      .update({ finished_at: archivedAt, journey_status: "stopped" })
      .eq("tenant_id", config.tenant_id)
      .eq("journey_status", "running")
      .select("id")
  ]);
  assertNoError(memberships.error, "reset test memberships");
  assertNoError(enrollments.error, "reset test enrollments");
  assertNoError(runningJourneys.error, "reset running journeys");
  const configResult = await admin
    .from("journey_bot_configs")
    .update({
      budget_started_at: archivedAt,
      enabled: false,
      journeys_started_total: 0,
      last_error: null,
      last_status: "test_cycle_reset",
      locked_at: null,
      lock_token: null,
      next_run_at: null,
      paused: true,
      updated_by: actorUserId
    })
    .eq("id", config.id);
  assertNoError(configResult.error, "reset journey bot config");

  return {
    cancelledEnrollments: enrollments.data?.length ?? 0,
    releasedMemberships: memberships.data?.length ?? 0,
    stoppedJourneys: runningJourneys.data?.length ?? 0
  };
}

async function runChildJourney(input: { config: JourneyBotConfigRow; ordinal: number; runId: string; sequence: number }): Promise<JourneyExecutionResult> {
  const admin = createAdminClient();
  const profile = createSyntheticProfile(input.runId, input.ordinal, input.sequence, input.config.scenario_mode);
  const scenario =
    input.config.scenario_mode === "stress_mix" && profile.stressVariant !== "normal"
      ? "intake_to_placement"
      : resolveScenarioMode(input.config.scenario_mode, profile.scenarioRandom);
  const program = await selectProgram(input.config);
  const stages = await getProgramStages(input.config.tenant_id, program.id);
  const ageDecision = getMinimumAgeDecision(profile.birthDate);
  const journeyResult = await admin
    .from("journey_bot_child_journeys")
    .insert({
      run_id: input.runId,
      tenant_id: input.config.tenant_id,
      environment: input.config.environment,
      scenario_mode: input.config.scenario_mode,
      journey_status: "running",
      child_display_name: profile.childName,
      guardian_display_name: profile.guardianName,
      birth_date: profile.birthDate,
      is_under_minimum_age: ageDecision.blocked,
      eligible_from: ageDecision.eligibleFrom,
      smoke_run_id: profile.smokeRunId,
      metadata_json: {
        address: profile.address,
        district: profile.district,
        email: profile.email,
        minimumAge: MINIMUM_AGE,
        resolvedScenario: scenario,
        safeMode: true,
        sequence: input.sequence,
        stressVariant: profile.stressVariant
      }
    })
    .select("*")
    .single();
  assertNoError(journeyResult.error, "create child journey");
  let journey = journeyResult.data as JourneyRow;

  try {
    const intake = await createIntake({ config: input.config, journey, profile, program });
    journey = await updateJourney(journey, { intake_submission_id: intake.id });
    await appendEvent(journey, "intake_created", "completed", `Intake aangemaakt voor ${program.name}.`, { intakeId: intake.id });

    if (scenario === "intake_only") {
      return await finishJourney(journey, "completed_intake", "passed", "Intake zichtbaar en veilig als Journey Bot-testdata opgeslagen.");
    }

    const guardianId = await createGuardian({ config: input.config, journey, profile });
    const participant = await createParticipant({ config: input.config, guardianId, journey, profile });
    journey = await updateJourney(journey, { guardian_id: guardianId, participant_id: participant.id });
    const firstStage = stages[0];
    if (!firstStage) {
      await blockJourney(journey, input.config, "missing_stage", "Programma bevat geen actieve niveaus.", "error");
      return executionResult(journey.id, "failed", "technical_failure");
    }

    const waitlist = await createWaitlist({ config: input.config, intakeId: intake.id, journey, profile, program, stage: firstStage, ageDecision });
    journey = await updateJourney(journey, { waitlist_entry_id: waitlist.id, current_program_id: program.id, current_stage_id: firstStage.id });
    await appendEvent(journey, "waitlist_created", "completed", ageDecision.blocked ? "Wachtlijstentry geblokkeerd tot vierde verjaardag." : "Wachtlijstentry volgens FIFO aangemaakt.", {
      eligibleFrom: ageDecision.eligibleFrom,
      minimumAgeBlocked: ageDecision.blocked,
      priorityDate: waitlist.priority_date
    });

    if (ageDecision.blocked) {
      return await finishJourney(
        journey,
        "blocked_until_eligible",
        "expected_blocker",
        `Niet plaatsbaar vóór ${ageDecision.eligibleFrom}; FIFO-prioriteitsdatum blijft behouden.`
      );
    }
    if (profile.stressVariant === "needs_review") {
      await createIssue({
        childJourneyId: journey.id,
        config: input.config,
        expected: true,
        issueType: "placement_blocked",
        message: "Watervrees/needs-review scenario vereist eerst een handmatige niveaubeoordeling.",
        runId: input.runId,
        severity: "warning",
        step: "placement_review"
      });
      return await finishJourney(journey, "partial", "expected_blocker", "Plaatsing bewust gepauzeerd voor handmatige beoordeling.");
    }
    if (profile.stressVariant === "recoverable_issue") {
      await createIssue({
        childJourneyId: journey.id,
        config: input.config,
        expected: true,
        issueType: "simulated_recoverable_issue",
        message: "Gecontroleerd stressscenario heeft een herstelbaar issue gelogd zonder verdere mutaties.",
        runId: input.runId,
        severity: "warning",
        step: "stress_injection"
      });
      return await finishJourney(journey, "partial", "expected_blocker", "Herstelbaar issue correct opgeslagen en journey veilig begrensd.");
    }

    const placement = await placeInStage({ config: input.config, journey, program, stage: firstStage, waitlist, profile });
    if (!placement) {
      return executionResult(
        journey.id,
        profile.stressVariant === "no_capacity" ? "blocked_no_capacity" : "partial",
        "expected_blocker"
      );
    }
    journey = await updateJourney(journey, {
      current_group_id: placement.group.id,
      enrollment_id: placement.enrollment.id
    });

    if (scenario === "intake_to_placement") {
      return await finishJourney(journey, "completed_placement", "passed", `Geplaatst in ${firstStage.name}, groep ${placement.group.name}.`);
    }

    const stagesToRun = scenario === "placement_to_next_stage" ? stages.slice(0, 2) : stages;
    let currentGroup = placement.group;
    let currentStage = firstStage;
    const enrollmentId = placement.enrollment.id;

    for (let stageIndex = 0; stageIndex < stagesToRun.length; stageIndex += 1) {
      currentStage = stagesToRun[stageIndex]!;
      const isTerminal = isTerminalStage(currentStage);

      if (isTerminal) {
        const completionDate = new Date().toISOString().slice(0, 10);
        const releasedMemberships = await admin
          .from("group_memberships")
          .update({ ends_on: completionDate, status: "completed" })
          .eq("tenant_id", input.config.tenant_id)
          .eq("enrollment_id", enrollmentId)
          .eq("status", "active")
          .select("id, group_id");
        assertNoError(releasedMemberships.error, "release final group capacity");
        await admin.from("enrollments").update({ current_stage_id: currentStage.id, status: "completed", ends_on: completionDate }).eq("id", enrollmentId);
        journey = await updateJourney(journey, { current_stage_id: currentStage.id, current_group_id: null });
        if (releasedMemberships.data?.length) {
          await appendEvent(journey, "old_capacity_released", "completed", "Laatste actieve groepsplek vrijgegeven na afronding van diploma C.", {
            memberships: releasedMemberships.data
          });
        }
        await appendEvent(journey, "stage_completed", "completed", `${currentStage.name}: leerlijn afgerond.`);
        break;
      }

      const progressOkay = await simulateStageProgress({ config: input.config, enrollmentId, group: currentGroup, journey, stage: currentStage });
      if (!progressOkay) {
        return await finishJourney(journey, "partial", "degraded", `Gestopt bij ${currentStage.name}: voortgangsmodules ontbreken.`);
      }

      const nextStage = stagesToRun[stageIndex + 1];
      if (!nextStage || isTerminalStage(nextStage)) continue;
      const transfer = await transferToStage({
        config: input.config,
        currentGroup,
        enrollmentId,
        journey,
        nextStage,
        program,
        waitlist,
        profile
      });
      if (!transfer) {
        return await finishJourney(journey, "blocked_no_capacity", "expected_blocker", `Geen capaciteit beschikbaar voor ${nextStage.name}.`);
      }
      currentGroup = transfer.group;
      journey = await updateJourney(journey, { current_group_id: currentGroup.id, current_stage_id: nextStage.id });
    }

    if (scenario === "placement_to_next_stage") {
      return await finishJourney(journey, "completed_transfer", "passed", `Doorgestroomd van ${firstStage.name} naar ${currentStage.name}.`);
    }

    const diplomaStage = [...stages].reverse().find((stage) => !isTerminalStage(stage)) ?? currentStage;
    const certificateOkay = await simulateGraduation({ config: input.config, enrollmentId, journey, program, stage: diplomaStage });
    const finalStatus = certificateOkay ? "completed_full_journey" : "partial";
    return await finishJourney(
      journey,
      finalStatus,
      certificateOkay ? "passed" : "degraded",
      certificateOkay
        ? `Volledige reis afgerond; ${diplomaStage.name}-testdiploma uitgegeven.`
        : `Reis afgerond tot afzwem-ready; diplomamodule kon niet worden voltooid.`
    );
  } catch (error) {
    await createIssue({
      childJourneyId: journey.id,
      config: input.config,
      issueType: "unexpected_exception",
      message: getErrorMessage(error),
      runId: input.runId,
      severity: "error",
      step: "child_journey"
    });
    return await finishJourney(journey, "failed", "technical_failure", `Journey afgebroken: ${getErrorMessage(error)}`);
  }
}

async function createIntake(input: {
  config: JourneyBotConfigRow;
  journey: JourneyRow;
  profile: SyntheticProfile;
  program: ProgramRow;
}) {
  const admin = createAdminClient();
  const { data: form } = await admin
    .from("intake_forms")
    .select("id")
    .eq("tenant_id", input.config.tenant_id)
    .eq("program_id", input.program.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const result = await admin
    .from("intake_submissions")
    .insert({
      tenant_id: input.config.tenant_id,
      form_id: form?.id ?? null,
      program_id: input.program.id,
      selected_option: "waitlist",
      parent_name: input.profile.guardianName,
      parent_email: input.profile.email,
      parent_phone: input.profile.phone,
      participant_name: input.profile.childName,
      participant_birth_date: input.profile.birthDate,
      preferred_days: ["maandag", "woensdag", "vrijdag"],
      preferred_dayparts: { "1": ["afternoon"], "3": ["afternoon"], "5": ["afternoon"] },
      preferred_notes: `Journey Bot · ${input.profile.smokeRunId} · ${input.profile.district}`,
      message: `Testadres: ${input.profile.address}, Den Haag. Geen externe communicatie.`,
      consent_given: true,
      source_hostname: "waterlijn-demo.staging.nxttrack.nl",
      status: "received",
      swimming_experience: "none",
      recommendation_snapshot: [],
      recommendation_version: "journey-bot-v1",
      duplicate_state: "unique",
      source: SOURCE,
      is_test: true,
      journey_run_id: input.journey.run_id,
      test_metadata_json: testMetadata(input.journey, { district: input.profile.district })
    })
    .select("id")
    .single();
  assertNoError(result.error, "create test intake");
  return result.data;
}

async function createGuardian(input: { config: JourneyBotConfigRow; journey: JourneyRow; profile: SyntheticProfile }) {
  const admin = createAdminClient();
  const result = await admin.auth.admin.createUser({
    app_metadata: { is_test: true, journey_run_id: input.journey.run_id, source: SOURCE, tenant_id: input.config.tenant_id },
    email: input.profile.email,
    email_confirm: true,
    password: `JB-${randomUUID()}-aA9!`
  });
  if (result.error || !result.data.user) throw new Error(`Create test guardian failed: ${result.error?.message ?? "unknown"}`);
  const userId = result.data.user.id;
  await Promise.all([
    admin.from("profiles").upsert({ id: userId, full_name: input.profile.guardianName, phone: input.profile.phone }, { onConflict: "id" }),
    admin.from("tenant_memberships").upsert(
      {
        tenant_id: input.config.tenant_id,
        user_id: userId,
        role: "parent",
        status: "active",
        invited_email: input.profile.email
      },
      { onConflict: "tenant_id,user_id,role" }
    )
  ]);
  await appendEvent(input.journey, "guardian_created", "completed", `${input.profile.guardianName} als afgeschermde testouder aangemaakt.`, { guardianUserId: userId });
  return userId;
}

async function createParticipant(input: { config: JourneyBotConfigRow; guardianId: string; journey: JourneyRow; profile: SyntheticProfile }) {
  const admin = createAdminClient();
  const result = await admin
    .from("participants")
    .insert({
      tenant_id: input.config.tenant_id,
      guardian_user_id: input.guardianId,
      display_name: input.profile.childName,
      birth_date: input.profile.birthDate,
      external_reference: input.profile.smokeRunId,
      status: "active",
      source: SOURCE,
      is_test: true,
      journey_run_id: input.journey.run_id,
      test_metadata_json: testMetadata(input.journey, { address: input.profile.address })
    })
    .select("id")
    .single();
  assertNoError(result.error, "create test participant");
  await admin.from("participant_guardians").insert({
    tenant_id: input.config.tenant_id,
    participant_id: result.data.id,
    guardian_user_id: input.guardianId,
    relationship: "parent",
    access_level: "primary",
    status: "active"
  });
  await appendEvent(input.journey, "participant_created", "completed", `${input.profile.childName} als herkenbare testleerling aangemaakt.`, { participantId: result.data.id });
  return result.data;
}

async function createWaitlist(input: {
  ageDecision: ReturnType<typeof getMinimumAgeDecision>;
  config: JourneyBotConfigRow;
  intakeId: string;
  journey: JourneyRow;
  profile: SyntheticProfile;
  program: ProgramRow;
  stage: StageRow;
}) {
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const result = await admin
    .from("waitlist_entries")
    .insert({
      tenant_id: input.config.tenant_id,
      intake_submission_id: input.intakeId,
      program_id: input.program.id,
      recommended_stage_id: input.stage.id,
      parent_name: input.profile.guardianName,
      parent_email: input.profile.email,
      parent_phone: input.profile.phone,
      participant_name: input.profile.childName,
      participant_birth_date: input.profile.birthDate,
      selected_option: "waitlist",
      status: "waiting",
      priority_date: today,
      source: SOURCE,
      admin_notes: `Journey Bot ${input.profile.smokeRunId}`,
      is_test: true,
      journey_run_id: input.journey.run_id,
      test_metadata_json: testMetadata(input.journey),
      eligible_from: input.ageDecision.eligibleFrom,
      minimum_age_blocked: input.ageDecision.blocked,
      waitlist_reason: input.ageDecision.blocked ? "under_minimum_age" : null
    })
    .select("*")
    .single();
  assertNoError(result.error, "create test waitlist entry");
  await admin.from("waitlist_preferences").insert(
    [1, 3, 5].map((weekday) => ({
      tenant_id: input.config.tenant_id,
      waitlist_entry_id: result.data.id,
      weekday,
      starts_after: "14:00",
      ends_before: "19:00",
      preference_weight: 5,
      notes: `Journey Bot ${input.profile.smokeRunId}`
    }))
  );
  return result.data;
}

async function placeInStage(input: {
  config: JourneyBotConfigRow;
  journey: JourneyRow;
  profile: SyntheticProfile;
  program: ProgramRow;
  stage: StageRow;
  waitlist: WaitlistEntryRow;
}) {
  const admin = createAdminClient();
  const scoring = await getPlacementInput(input.config.tenant_id, input.waitlist, input.stage.id);
  const scores = computePlacementScores(scoring);
  await appendEvent(input.journey, "placement_suggested", scores.length ? "completed" : "blocked", `${scores.length} plaatsingsoptie(s) berekend.`, {
    suggestions: scores.slice(0, 3).map((score) => ({ groupId: score.group.id, reasons: score.reasons, score: score.score }))
  });
  await savePlacementScores(input.config.tenant_id, input.waitlist.id, scores, input.journey.run_id);

  if (input.profile.stressVariant === "no_capacity") {
    await createIssue({
      childJourneyId: input.journey.id,
      config: input.config,
      expected: true,
      issueType: "no_capacity",
      message: "Stressscenario simuleert geen beschikbare plaats; leerling blijft veilig op de wachtlijst.",
      runId: input.journey.run_id,
      severity: "warning",
      step: "initial_placement"
    });
    await completeJourney(input.journey, "blocked_no_capacity", "Geen capaciteit; geen membership of enrollment aangemaakt.");
    return null;
  }

  const best = scores.find((score) => score.capacityAvailable > 0 && score.stageMatch);
  if (!best) {
    await blockJourney(input.journey, input.config, "placement_blocked", `Geen geldige groep met capaciteit voor ${input.stage.name}.`, "warning");
    return null;
  }

  const enrollmentResult = await admin
    .from("enrollments")
    .insert({
      tenant_id: input.config.tenant_id,
      participant_id: input.journey.participant_id,
      guardian_user_id: input.journey.guardian_id,
      program_id: input.program.id,
      current_stage_id: input.stage.id,
      status: "active",
      source: SOURCE,
      starts_on: new Date().toISOString().slice(0, 10),
      is_test: true,
      journey_run_id: input.journey.run_id,
      test_metadata_json: testMetadata(input.journey)
    })
    .select("id")
    .single();
  assertNoError(enrollmentResult.error, "create test enrollment");
  const membershipResult = await admin
    .from("group_memberships")
    .insert({
      tenant_id: input.config.tenant_id,
      group_id: best.group.id,
      enrollment_id: enrollmentResult.data.id,
      participant_id: input.journey.participant_id,
      status: "active",
      starts_on: new Date().toISOString().slice(0, 10),
      capacity_weight: 1,
      source: SOURCE,
      is_test: true,
      journey_run_id: input.journey.run_id,
      test_metadata_json: testMetadata(input.journey)
    })
    .select("id")
    .single();
  assertNoError(membershipResult.error, "create test group membership");
  await Promise.all([
    admin.from("waitlist_entries").update({ status: "placed" }).eq("id", input.waitlist.id),
    admin.from("intake_submissions").update({ status: "converted" }).eq("id", input.journey.intake_submission_id)
  ]);
  await appendEvent(input.journey, "placement_completed", "completed", `Geplaatst in ${best.group.name} met score ${best.score}.`, {
    capacityBefore: best.capacityAvailable,
    groupId: best.group.id,
    membershipId: membershipResult.data.id,
    reasons: best.reasons,
    score: best.score
  });
  return { enrollment: enrollmentResult.data, group: best.group };
}

async function simulateStageProgress(input: {
  config: JourneyBotConfigRow;
  enrollmentId: string;
  group: GroupRow;
  journey: JourneyRow;
  stage: StageRow;
}) {
  const admin = createAdminClient();
  const [sessionsResult, modulesResult, badgeResult] = await Promise.all([
    admin
      .from("sessions")
      .select("id, status, starts_at")
      .eq("tenant_id", input.config.tenant_id)
      .eq("group_id", input.group.id)
      .order("starts_at")
      .limit(8),
    admin
      .from("progress_modules")
      .select("id, name")
      .eq("tenant_id", input.config.tenant_id)
      .eq("stage_id", input.stage.id)
      .eq("status", "active")
      .order("sort_order"),
    admin
      .from("badge_definitions")
      .select("id, name")
      .eq("tenant_id", input.config.tenant_id)
      .eq("stage_id", input.stage.id)
      .eq("status", "active")
      .order("sort_order")
      .limit(1)
      .maybeSingle()
  ]);
  assertNoError(sessionsResult.error, "stage sessions");
  assertNoError(modulesResult.error, "progress modules");
  const sessions = sessionsResult.data ?? [];
  const modules = modulesResult.data ?? [];
  if (!modules.length) {
    await createIssue({
      childJourneyId: input.journey.id,
      config: input.config,
      issueType: "progress_modules_missing",
      message: `Geen voortgangsmodule voor ${input.stage.name}; voortgang niet gefaket.`,
      runId: input.journey.run_id,
      severity: "error",
      step: "progress"
    });
    await appendEvent(input.journey, "progress_updated", "blocked", `Voortgang geblokkeerd voor ${input.stage.name}.`);
    return false;
  }
  if (!sessions.length) {
    await createIssue({
      childJourneyId: input.journey.id,
      config: input.config,
      issueType: "missing_group",
      message: `Geen sessies gevonden voor ${input.group.name}.`,
      runId: input.journey.run_id,
      severity: "error",
      step: "attendance"
    });
    return false;
  }

  const attendanceSessions = sessions.slice(0, Math.min(6, sessions.length));
  await admin.from("session_attendance").upsert(
    attendanceSessions.map((session, index) => ({
      tenant_id: input.config.tenant_id,
      session_id: session.id,
      participant_id: input.journey.participant_id,
      enrollment_id: input.enrollmentId,
      status: index === 1 ? "late" : "present",
      note: `Journey Bot · les ${index + 1}`,
      source: SOURCE,
      is_test: true,
      journey_run_id: input.journey.run_id,
      test_metadata_json: testMetadata(input.journey, { stageId: input.stage.id })
    })),
    { onConflict: "tenant_id,session_id,participant_id" }
  );
  await appendEvent(input.journey, "attendance_simulated", "completed", `${attendanceSessions.length} lessen van ${input.stage.name} bijgewoond.`, {
    sessionIds: attendanceSessions.map((session) => session.id)
  });

  let scoredItems = 0;
  for (const module of modules) {
    const itemsResult = await admin
      .from("progress_items")
      .select("id, name")
      .eq("tenant_id", input.config.tenant_id)
      .eq("module_id", module.id)
      .eq("status", "active")
      .order("sort_order");
    assertNoError(itemsResult.error, "progress items");
    const rows = (itemsResult.data ?? []).map((item) => ({
      tenant_id: input.config.tenant_id,
      participant_id: input.journey.participant_id,
      enrollment_id: input.enrollmentId,
      module_id: module.id,
      item_id: item.id,
      session_id: attendanceSessions.at(-1)?.id ?? null,
      score: 5,
      positive_label: "Beheerst",
      note: `Versneld opgebouwd over ${attendanceSessions.length} Journey Bot-lessen.`,
      visibility: "internal",
      status: "active",
      source: SOURCE,
      is_test: true,
      journey_run_id: input.journey.run_id,
      test_metadata_json: testMetadata(input.journey, { stageId: input.stage.id })
    }));
    if (rows.length) {
      const scoreResult = await admin.from("participant_progress_scores").upsert(rows, { onConflict: "tenant_id,participant_id,item_id" });
      assertNoError(scoreResult.error, "simulate progress scores");
      scoredItems += rows.length;
    }
  }
  await appendEvent(input.journey, "progress_updated", "completed", `${scoredItems} vaardigheden voor ${input.stage.name} afgerond.`, { score: 5 });

  if (badgeResult.error) throw new Error(`Load badge failed: ${badgeResult.error.message}`);
  if (badgeResult.data) {
    const awardResult = await admin.from("participant_badge_awards").insert({
      tenant_id: input.config.tenant_id,
      participant_id: input.journey.participant_id,
      enrollment_id: input.enrollmentId,
      badge_definition_id: badgeResult.data.id,
      source_session_id: attendanceSessions.at(-1)?.id ?? null,
      title: badgeResult.data.name,
      note: "Journey Bot stage completion",
      visibility: "internal",
      status: "awarded",
      source: SOURCE,
      is_test: true,
      journey_run_id: input.journey.run_id,
      test_metadata_json: testMetadata(input.journey)
    });
    assertNoError(awardResult.error, "award test badge");
    await appendEvent(input.journey, "badge_awarded", "completed", `Badge ${badgeResult.data.name} toegekend.`);
  } else {
    await createIssue({
      childJourneyId: input.journey.id,
      config: input.config,
      expected: true,
      issueType: "badge_engine_missing",
      message: `Geen badge voor ${input.stage.name}; stage kan wel doorgaan.`,
      runId: input.journey.run_id,
      severity: "info",
      step: "badge"
    });
  }
  await appendEvent(input.journey, "stage_completed", "completed", `${input.stage.name} volledig afgerond.`);
  return true;
}

async function transferToStage(input: {
  config: JourneyBotConfigRow;
  currentGroup: GroupRow;
  enrollmentId: string;
  journey: JourneyRow;
  nextStage: StageRow;
  profile: SyntheticProfile;
  program: ProgramRow;
  waitlist: WaitlistEntryRow;
}) {
  const admin = createAdminClient();
  const scoring = await getPlacementInput(input.config.tenant_id, { ...input.waitlist, recommended_stage_id: input.nextStage.id }, input.nextStage.id);
  const scores = computePlacementScores(scoring);
  const best = scores.find((score) => score.capacityAvailable > 0 && score.stageMatch);
  await appendEvent(input.journey, "stage_transfer_suggested", best ? "completed" : "blocked", best ? `${input.nextStage.name}: ${best.group.name} met score ${best.score}.` : `Geen plek voor ${input.nextStage.name}.`, {
    suggestions: scores.slice(0, 3).map((score) => ({ groupId: score.group.id, reasons: score.reasons, score: score.score }))
  });
  if (!best) {
    await createIssue({
      childJourneyId: input.journey.id,
      config: input.config,
      expected: true,
      issueType: "no_capacity",
      message: `Geen capaciteit in de volgende stage ${input.nextStage.name}; wachtlijst behouden.`,
      runId: input.journey.run_id,
      severity: "warning",
      step: "stage_transfer"
    });
    return null;
  }

  const today = new Date().toISOString().slice(0, 10);
  const oldMembershipResult = await admin
    .from("group_memberships")
    .select("id")
    .eq("tenant_id", input.config.tenant_id)
    .eq("group_id", input.currentGroup.id)
    .eq("enrollment_id", input.enrollmentId)
    .eq("status", "active")
    .maybeSingle();
  assertNoError(oldMembershipResult.error, "old group membership");
  if (!oldMembershipResult.data) {
    await createIssue({
      childJourneyId: input.journey.id,
      config: input.config,
      issueType: "transfer_failed",
      message: "Actieve oude groepsplek ontbreekt; transfer afgebroken.",
      runId: input.journey.run_id,
      severity: "error",
      step: "stage_transfer"
    });
    return null;
  }

  await admin.from("group_memberships").update({ ends_on: today, status: "completed" }).eq("id", oldMembershipResult.data.id);
  await appendEvent(input.journey, "old_capacity_released", "completed", `Oude plek in ${input.currentGroup.name} vrijgegeven.`, {
    groupId: input.currentGroup.id,
    membershipId: oldMembershipResult.data.id
  });
  const newMembershipResult = await admin
    .from("group_memberships")
    .insert({
      tenant_id: input.config.tenant_id,
      group_id: best.group.id,
      enrollment_id: input.enrollmentId,
      participant_id: input.journey.participant_id,
      status: "active",
      starts_on: today,
      capacity_weight: 1,
      source: SOURCE,
      is_test: true,
      journey_run_id: input.journey.run_id,
      test_metadata_json: testMetadata(input.journey, { transferFromGroupId: input.currentGroup.id })
    })
    .select("id")
    .single();
  assertNoError(newMembershipResult.error, "new group membership");
  await admin.from("enrollments").update({ current_stage_id: input.nextStage.id }).eq("id", input.enrollmentId);
  await appendEvent(input.journey, "stage_transfer_completed", "completed", `Doorgestroomd naar ${input.nextStage.name}, ${best.group.name}.`, {
    groupId: best.group.id,
    membershipId: newMembershipResult.data.id,
    score: best.score
  });
  return { group: best.group };
}

async function simulateGraduation(input: {
  config: JourneyBotConfigRow;
  enrollmentId: string;
  journey: JourneyRow;
  program: ProgramRow;
  stage: StageRow;
}) {
  const admin = createAdminClient();
  const readinessResult = await admin
    .from("graduation_readiness")
    .upsert(
      {
        tenant_id: input.config.tenant_id,
        participant_id: input.journey.participant_id,
        enrollment_id: input.enrollmentId,
        program_id: input.program.id,
        stage_id: input.stage.id,
        status: "ready",
        readiness_score: 100,
        checklist_summary: "Journey Bot: attendance en alle voortgangsitems afgerond.",
        reviewed_at: new Date().toISOString(),
        source: SOURCE,
        is_test: true,
        journey_run_id: input.journey.run_id,
        test_metadata_json: testMetadata(input.journey)
      },
      { onConflict: "tenant_id,enrollment_id,stage_id" }
    )
    .select("id")
    .single();
  if (readinessResult.error) {
    await createIssue({
      childJourneyId: input.journey.id,
      config: input.config,
      issueType: "afzwem_module_missing",
      message: readinessResult.error.message,
      runId: input.journey.run_id,
      severity: "error",
      step: "graduation_readiness"
    });
    return false;
  }
  await appendEvent(input.journey, "afzwem_ready", "completed", `${input.stage.name}: afzwem-ready met score 100.`);

  const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  startsAt.setUTCHours(17, 0, 0, 0);
  const eventResult = await admin
    .from("graduation_events")
    .insert({
      tenant_id: input.config.tenant_id,
      program_id: input.program.id,
      stage_id: input.stage.id,
      title: `Journey Bot afzwemmen · ${input.journey.smoke_run_id}`,
      status: "completed",
      starts_at: startsAt.toISOString(),
      ends_at: new Date(startsAt.getTime() + 90 * 60_000).toISOString(),
      capacity: 8,
      notes: "Uitsluitend testdata; geen externe uitnodigingen.",
      source: SOURCE,
      is_test: true,
      journey_run_id: input.journey.run_id,
      test_metadata_json: testMetadata(input.journey)
    })
    .select("id")
    .single();
  if (eventResult.error) {
    await createIssue({
      childJourneyId: input.journey.id,
      config: input.config,
      issueType: "afzwem_module_missing",
      message: eventResult.error.message,
      runId: input.journey.run_id,
      severity: "error",
      step: "graduation_event"
    });
    return false;
  }
  await appendEvent(input.journey, "afzwem_event_created", "completed", "Test-afzwemmoment aangemaakt.", { eventId: eventResult.data.id });

  const participantResult = await admin
    .from("graduation_event_participants")
    .insert({
      tenant_id: input.config.tenant_id,
      event_id: eventResult.data.id,
      participant_id: input.journey.participant_id,
      enrollment_id: input.enrollmentId,
      readiness_id: readinessResult.data.id,
      invite_status: "confirmed",
      status: "passed",
      invited_at: new Date().toISOString(),
      responded_at: new Date().toISOString(),
      result: "passed",
      result_registered_at: new Date().toISOString(),
      result_notes: "Journey Bot testresultaat",
      source: SOURCE,
      is_test: true,
      journey_run_id: input.journey.run_id,
      test_metadata_json: testMetadata(input.journey)
    })
    .select("id")
    .single();
  if (participantResult.error) {
    await createIssue({
      childJourneyId: input.journey.id,
      config: input.config,
      issueType: "afzwem_module_missing",
      message: participantResult.error.message,
      runId: input.journey.run_id,
      severity: "error",
      step: "graduation_result"
    });
    return false;
  }

  const certificateResult = await admin.from("certificate_records").insert({
    tenant_id: input.config.tenant_id,
    participant_id: input.journey.participant_id,
    enrollment_id: input.enrollmentId,
    program_id: input.program.id,
    stage_id: input.stage.id,
    event_participant_id: participantResult.data.id,
    certificate_number: `TEST-${input.journey.smoke_run_id}`,
    title: `${input.stage.name} · testdiploma`,
    status: "issued",
    issued_on: new Date().toISOString().slice(0, 10),
    notes: "Journey Simulation Bot · niet geldig als officieel diploma.",
    source: SOURCE,
    is_test: true,
    journey_run_id: input.journey.run_id,
    test_metadata_json: testMetadata(input.journey)
  });
  if (certificateResult.error) {
    await createIssue({
      childJourneyId: input.journey.id,
      config: input.config,
      issueType: "certificate_module_missing",
      message: certificateResult.error.message,
      runId: input.journey.run_id,
      severity: "error",
      step: "certificate"
    });
    return false;
  }
  await admin.from("graduation_readiness").update({ status: "completed" }).eq("id", readinessResult.data.id);
  await appendEvent(input.journey, "certificate_created", "completed", `${input.stage.name}-testdiploma aangemaakt.`);
  return true;
}

async function getPlacementInput(tenantId: string, entry: WaitlistEntryRow, stageId: string) {
  const admin = createAdminClient();
  const [preferencesResult, groupsResult, membershipsResult] = await Promise.all([
    admin.from("waitlist_preferences").select("id, waitlist_entry_id, weekday, starts_after, ends_before, preference_weight").eq("tenant_id", tenantId).eq("waitlist_entry_id", entry.id),
    admin
      .from("groups")
      .select("id, program_id, stage_id, default_resource_id, name, code, status, capacity, default_weekday, default_start_time, default_end_time")
      .eq("tenant_id", tenantId)
      .eq("program_id", entry.program_id)
      .eq("stage_id", stageId)
      .eq("status", "active"),
    admin.from("group_memberships").select("id, group_id, enrollment_id, participant_id, status, capacity_weight").eq("tenant_id", tenantId)
  ]);
  assertNoError(preferencesResult.error, "waitlist preferences");
  assertNoError(groupsResult.error, "placement groups");
  assertNoError(membershipsResult.error, "placement memberships");
  return {
    entry: { ...entry, recommended_stage_id: stageId },
    groups: (groupsResult.data ?? []) as GroupRow[],
    memberships: (membershipsResult.data ?? []) as GroupMembershipRow[],
    preferences: (preferencesResult.data ?? []) as WaitlistPreferenceRow[]
  };
}

async function savePlacementScores(tenantId: string, entryId: string, scores: ReturnType<typeof computePlacementScores>, runId: string) {
  const admin = createAdminClient();
  await admin.from("placement_scores").delete().eq("tenant_id", tenantId).eq("waitlist_entry_id", entryId);
  if (!scores.length) return;
  const result = await admin.from("placement_scores").insert(
    scores.map((score) => ({
      tenant_id: tenantId,
      waitlist_entry_id: entryId,
      group_id: score.group.id,
      score: score.score,
      capacity_available: score.capacityAvailable,
      stage_match: score.stageMatch,
      preferred_day_match: score.preferredDayMatch,
      reasons: [...score.reasons, `journey_run:${runId}`]
    }))
  );
  assertNoError(result.error, "save placement scores");
}

async function selectProgram(config: JourneyBotConfigRow): Promise<ProgramRow> {
  const admin = createAdminClient();
  const configuredIds = parseStringArray(config.program_ids_json);
  let query = admin.from("programs").select("id, name, code").eq("tenant_id", config.tenant_id).eq("status", "active").order("sort_order");
  if (configuredIds.length) query = query.in("id", configuredIds);
  const { data, error } = await query;
  assertNoError(error, "active journey program");
  if (!data?.length) throw new Error("No active target program available.");
  const withStageCounts = await Promise.all(
    data.map(async (program) => {
      const countResult = await admin.from("program_stages").select("id", { count: "exact", head: true }).eq("tenant_id", config.tenant_id).eq("program_id", program.id).eq("status", "active");
      return { count: countResult.count ?? 0, program };
    })
  );
  return withStageCounts.sort((left, right) => right.count - left.count)[0]!.program as ProgramRow;
}

async function getProgramStages(tenantId: string, programId: string): Promise<StageRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("program_stages")
    .select("id, program_id, name, code, sort_order")
    .eq("tenant_id", tenantId)
    .eq("program_id", programId)
    .eq("status", "active")
    .order("sort_order");
  assertNoError(error, "program stages");
  return (data ?? []) as StageRow[];
}

async function getRunAllowance(config: JourneyBotConfigRow) {
  const admin = createAdminClient();
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const [todayResult, activeResult] = await Promise.all([
    admin.from("journey_bot_child_journeys").select("id", { count: "exact", head: true }).eq("tenant_id", config.tenant_id).gte("started_at", startOfDay.toISOString()),
    admin.from("journey_bot_child_journeys").select("id", { count: "exact", head: true }).eq("tenant_id", config.tenant_id).eq("journey_status", "running")
  ]);
  assertNoError(todayResult.error, "daily journey count");
  assertNoError(activeResult.error, "active journey count");
  return calculateJourneyRunAllowance({
    activeJourneys: activeResult.count ?? 0,
    journeysStartedToday: todayResult.count ?? 0,
    journeysStartedTotal: config.journeys_started_total,
    maxActiveJourneys: config.max_active_journeys,
    maxJourneysPerDay: config.max_journeys_per_day,
    maxJourneysPerRun: config.max_journeys_per_run,
    stopAfterJourneys: config.stop_after_journeys
  });
}

async function getConfig(configId: string): Promise<JourneyBotConfigRow> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("journey_bot_configs").select("*").eq("id", configId).single();
  assertNoError(error, "journey bot config");
  return data as JourneyBotConfigRow;
}

async function releaseConfig(config: JourneyBotConfigRow, lockToken: string, status: string, error: string | null, startedCount: number) {
  const admin = createAdminClient();
  const journeysStartedTotal = config.journeys_started_total + startedCount;
  const stopReason = getJourneyConfigStopReason({
    journeysStartedTotal,
    runUntil: config.run_until,
    stopAfterJourneys: config.stop_after_journeys
  });
  const schedule = chooseNextRunAt({
    maxIntervalMinutes: config.max_interval_minutes,
    minIntervalMinutes: config.min_interval_minutes
  });
  await admin
    .from("journey_bot_configs")
    .update({
      last_error: error,
      last_run_at: new Date().toISOString(),
      last_status: status,
      locked_at: null,
      lock_token: null,
      enabled: stopReason ? false : config.enabled,
      paused: stopReason ? true : config.paused,
      journeys_started_total: journeysStartedTotal,
      next_run_at: stopReason ? null : schedule.nextRunAt
    })
    .eq("id", config.id)
    .eq("lock_token", lockToken);
}

async function stopJourneyBotConfig(
  config: JourneyBotConfigRow,
  reason: "run_window_ended" | "journey_limit_reached",
  lockToken?: string
) {
  const admin = createAdminClient();
  let query = admin
    .from("journey_bot_configs")
    .update({
      enabled: false,
      last_error: null,
      last_status: reason,
      locked_at: null,
      lock_token: null,
      next_run_at: null,
      paused: true
    })
    .eq("id", config.id);
  if (lockToken) query = query.eq("lock_token", lockToken);
  const result = await query;
  assertNoError(result.error, `stop config: ${reason}`);
}

function isConfigWithinSchedule(config: JourneyBotConfigRow) {
  if (
    getJourneyConfigStopReason({
      journeysStartedTotal: config.journeys_started_total,
      runUntil: config.run_until,
      stopAfterJourneys: config.stop_after_journeys
    })
  ) {
    return false;
  }
  return isActiveJourneyWindow({
    activeDays: parseNumberArray(config.active_days_json),
    activeWindows: parseWindows(config.active_time_windows_json)
  });
}

async function appendEvent(journey: JourneyRow, eventType: string, eventStatus: string, message: string, context: Record<string, unknown> = {}) {
  const admin = createAdminClient();
  const result = await admin.from("journey_bot_child_events").insert({
    tenant_id: journey.tenant_id,
    child_journey_id: journey.id,
    participant_id: journey.participant_id,
    event_type: eventType,
    event_status: eventStatus,
    message,
    context_json: context
  });
  assertNoError(result.error, `journey event ${eventType}`);
  const currentResult = await admin.from("journey_bot_child_journeys").select("summary_log").eq("id", journey.id).single();
  assertNoError(currentResult.error, "load current journey summary");
  const currentSummary = currentResult.data.summary_log || "";
  const line = `${new Date().toISOString()} · ${message}`;
  await admin
    .from("journey_bot_child_journeys")
    .update({ summary_log: currentSummary ? `${currentSummary}\n${line}` : `${journey.child_display_name} — Journey Bot\n${line}` })
    .eq("id", journey.id);
  journey.summary_log = currentSummary ? `${currentSummary}\n${line}` : `${journey.child_display_name} — Journey Bot\n${line}`;
}

async function createIssue(input: {
  childJourneyId?: string;
  config: JourneyBotConfigRow;
  context?: Record<string, unknown>;
  expected?: boolean;
  issueType: string;
  message: string;
  runId: string;
  severity: "info" | "warning" | "error" | "critical";
  step?: string;
}) {
  const admin = createAdminClient();
  const expected = input.expected ?? false;
  const step = input.step ?? "unknown";
  await admin.from("journey_bot_issues").insert({
    tenant_id: input.config.tenant_id,
    run_id: input.runId,
    child_journey_id: input.childJourneyId ?? null,
    severity: input.severity,
    issue_type: input.issueType,
    message: input.message,
    context_json: { canContinue: input.severity === "info" || input.severity === "warning", expected, step, ...(input.context ?? {}) },
    expected,
    fingerprint: `${input.issueType}:${step}`,
    step
  });
  if (input.childJourneyId) {
    const { data: journey } = await admin.from("journey_bot_child_journeys").select("*").eq("id", input.childJourneyId).single();
    if (journey) await appendEvent(journey as JourneyRow, "issue_created", input.severity === "critical" ? "failed" : "blocked", input.message, { issueType: input.issueType });
  }
}

async function blockJourney(journey: JourneyRow, config: JourneyBotConfigRow, issueType: string, message: string, severity: "warning" | "error") {
  const expected = severity === "warning" && (issueType === "no_capacity" || issueType === "placement_blocked");
  await createIssue({ childJourneyId: journey.id, config, expected, issueType, message, runId: journey.run_id, severity, step: "business_rule" });
  await completeJourney(journey, severity === "error" ? "failed" : "partial", message, expected ? "expected_blocker" : "technical_failure");
}

async function completeJourney(
  journey: JourneyRow,
  status: string,
  summary: string,
  classification: JourneyOutcomeClassification = inferOutcomeClassification(status)
) {
  const admin = createAdminClient();
  await appendEvent(journey, "journey_completed", status === "failed" ? "failed" : status.startsWith("blocked") ? "blocked" : "completed", summary, { status });
  await admin
    .from("journey_bot_child_journeys")
    .update({
      expected_outcome: classification === "expected_blocker",
      finished_at: new Date().toISOString(),
      journey_status: status,
      outcome_classification: classification
    })
    .eq("id", journey.id);
}

async function finishJourney(
  journey: JourneyRow,
  status: string,
  classification: JourneyOutcomeClassification,
  summary: string
): Promise<JourneyExecutionResult> {
  await completeJourney(journey, status, summary, classification);
  return executionResult(journey.id, status, classification);
}

function executionResult(journeyId: string, status: string, classification: JourneyOutcomeClassification): JourneyExecutionResult {
  return { classification, journeyId, status };
}

function inferOutcomeClassification(status: string): JourneyOutcomeClassification {
  if (status.startsWith("completed_")) return "passed";
  if (status.startsWith("blocked_")) return "expected_blocker";
  if (status === "failed") return "technical_failure";
  return "degraded";
}

async function updateJourney(journey: JourneyRow, values: Record<string, unknown>) {
  const admin = createAdminClient();
  const result = await admin.from("journey_bot_child_journeys").update(values).eq("id", journey.id).select("*").single();
  assertNoError(result.error, "update child journey");
  return result.data as JourneyRow;
}

async function getRunIssueSummary(runId: string): Promise<JourneyIssueSummary> {
  const admin = createAdminClient();
  const result = await admin.from("journey_bot_issues").select("severity, expected").eq("run_id", runId);
  assertNoError(result.error, "run issue summary");
  const summary: JourneyIssueSummary = { critical: 0, error: 0, expected: 0, info: 0, unexpected: 0, warning: 0 };
  for (const issue of result.data ?? []) {
    const severity = issue.severity as "info" | "warning" | "error" | "critical";
    summary[severity] += 1;
    if (issue.expected) summary.expected += 1;
    else summary.unexpected += 1;
  }
  return summary;
}

type SyntheticProfile = {
  address: string;
  birthDate: string;
  childName: string;
  district: string;
  email: string;
  guardianName: string;
  phone: string;
  scenarioRandom: number;
  smokeRunId: string;
  stressVariant: JourneyStressVariant;
};

function createSyntheticProfile(runId: string, ordinal: number, sequence: number, scenario: JourneyScenarioMode): SyntheticProfile {
  const seed = Number.parseInt(runId.replaceAll("-", "").slice(-8), 16) + sequence;
  const firstName = childFirstNames[seed % childFirstNames.length]!;
  const lastName = childLastNames[(seed * 3) % childLastNames.length]!;
  const guardianName = guardianNames[(seed * 5) % guardianNames.length]!;
  const street = streets[(seed * 7) % streets.length]!;
  const district = districts[(seed * 11) % districts.length]!;
  const stamp = `${Date.now()}-${ordinal}`;
  const stressVariant = scenario === "stress_mix" ? resolveStressVariant(sequence) : "normal";
  const year = stressVariant === "under_4" ? new Date().getUTCFullYear() - 2 : 2018 + (seed % 4);
  const month = String((seed % 12) + 1).padStart(2, "0");
  const day = String((seed % 20) + 5).padStart(2, "0");

  return {
    address: `${street} ${(seed % 180) + 1}`,
    birthDate: `${year}-${month}-${day}`,
    childName: `${firstName} ${lastName}`,
    district,
    email: `journey+${stamp}@${process.env.JOURNEY_BOT_EMAIL_DOMAIN || "nxttrack.test"}`,
    guardianName,
    phone: ["0611111111", "0622222222", "0633333333"][seed % 3]!,
    scenarioRandom: (seed % 100) / 100,
    smokeRunId: `JB-${runId.slice(0, 8)}-${String(ordinal + 1).padStart(2, "0")}`,
    stressVariant
  };
}

function testMetadata(journey: JourneyRow, extra: Record<string, unknown> = {}) {
  return {
    isTest: true,
    journeyChildId: journey.id,
    journeyRunId: journey.run_id,
    safeToArchive: true,
    smokeRunId: journey.smoke_run_id,
    source: SOURCE,
    ...extra
  };
}

function isTerminalStage(stage: StageRow) {
  return stage.code?.toUpperCase() === "KLAAR" || stage.name.trim().toLowerCase() === "klaar";
}

function requireAllowedEnvironment() {
  const status = getJourneyBotEnvironmentStatus();
  if (!status.environment || !status.allowed) {
    throw new Error(`Journey Bot is hard-blocked in APP_ENV=${process.env.APP_ENV || "unset"}.`);
  }
  return status.environment;
}

function parseStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function parseNumberArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number" && item >= 1 && item <= 7) : [];
}

function parseWindows(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    item && typeof item === "object" && !Array.isArray(item) && typeof item.start === "string" && typeof item.end === "string"
      ? [{ end: item.end, start: item.start }]
      : []
  );
}

function assertNoError(error: { message: string } | null, label: string): asserts error is null {
  if (error) throw new Error(`${label}: ${error.message}`);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
