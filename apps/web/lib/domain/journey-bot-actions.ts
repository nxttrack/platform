"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { journeyScenarioModes, normalizeJourneyBotEnvironment, type JourneyScenarioMode } from "./journey-bot-contract";
import {
  archiveJourneyBotRun,
  getJourneyBotEnvironmentStatus,
  resetJourneyBotTestCycle,
  runJourneyBotConfig,
  stopAllJourneyBots
} from "./journey-bot";

const pagePath = "/platform/test-tools/journey-bot";

export async function saveJourneyBotConfigAction(formData: FormData) {
  const context = await requirePlatformAdmin();
  const environmentStatus = getJourneyBotEnvironmentStatus();
  if (!environmentStatus.allowed || !environmentStatus.environment) redirect(`${pagePath}?error=environment`);
  const tenantId = readRequired(formData, "tenantId");
  const scenarioMode = readScenario(formData, "scenarioMode");
  const minInterval = readInteger(formData, "minIntervalMinutes", 1, 1440, 3);
  const maxInterval = readInteger(formData, "maxIntervalMinutes", minInterval, 1440, 12);
  const runDurationHours = readInteger(formData, "runDurationHours", 0, 168, 0);
  const stopAfterJourneys = readInteger(formData, "stopAfterJourneys", 0, 10_000, 0);
  const admin = createAdminClient();
  const tenantResult = await admin.from("tenants").select("id").eq("id", tenantId).eq("status", "active").maybeSingle();
  if (tenantResult.error || !tenantResult.data) redirect(`${pagePath}?error=tenant`);
  const programIds = formData
    .getAll("programIds")
    .filter((value): value is string => typeof value === "string" && isUuid(value));
  const enabled = formData.get("enabled") === "on";
  const paused = formData.get("paused") === "on";
  const now = new Date();
  const existingResult = await admin
    .from("journey_bot_configs")
    .select("id, enabled, scenario_mode, stop_after_journeys, journeys_started_total, budget_started_at")
    .eq("environment", environmentStatus.environment)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (existingResult.error) redirect(`${pagePath}?error=config`);
  const stopAfter = stopAfterJourneys > 0 ? stopAfterJourneys : null;
  const resetBudget =
    !existingResult.data ||
    existingResult.data.scenario_mode !== scenarioMode ||
    existingResult.data.stop_after_journeys !== stopAfter ||
    (!existingResult.data.enabled && enabled);
  const result = await admin.from("journey_bot_configs").upsert(
    {
      environment: environmentStatus.environment,
      tenant_id: tenantId,
      enabled,
      paused,
      scenario_mode: scenarioMode,
      min_interval_minutes: minInterval,
      max_interval_minutes: maxInterval,
      max_journeys_per_run: readInteger(formData, "maxJourneysPerRun", 1, 25, 1),
      max_active_journeys: readInteger(formData, "maxActiveJourneys", 1, 100, 3),
      max_journeys_per_day: readInteger(formData, "maxJourneysPerDay", 1, 1000, 50),
      active_days_json: readActiveDays(formData),
      active_time_windows_json: [{ start: readTime(formData, "windowStart", "00:00"), end: readTime(formData, "windowEnd", "23:59") }],
      program_ids_json: programIds,
      run_speed: readEnum(formData, "runSpeed", ["fast", "balanced", "realistic"] as const, "fast"),
      suppress_external_notifications: true,
      suppress_real_payments: true,
      use_fallback_placement: formData.get("useFallbackPlacement") === "on",
      cleanup_after_days: readInteger(formData, "cleanupAfterDays", 1, 365, 14),
      run_until: runDurationHours > 0 ? new Date(now.getTime() + runDurationHours * 60 * 60_000).toISOString() : null,
      stop_after_journeys: stopAfter,
      next_run_at: enabled && !paused ? now.toISOString() : null,
      budget_started_at: resetBudget ? now.toISOString() : existingResult.data?.budget_started_at ?? now.toISOString(),
      journeys_started_total: resetBudget ? 0 : existingResult.data?.journeys_started_total ?? 0,
      updated_by: context.user.id,
      created_by: context.user.id
    },
    { onConflict: "environment,tenant_id" }
  );
  if (result.error) redirect(`${pagePath}?error=config`);
  revalidatePath(pagePath);
  redirect(`${pagePath}?saved=config`);
}

export async function runJourneyBotNowAction(formData: FormData) {
  const context = await requirePlatformAdmin();
  const configId = readRequired(formData, "configId");
  let runId = "";
  try {
    const result = await runJourneyBotConfig(configId, { ignoreSchedule: true, requestedBy: context.user.id });
    runId = "runId" in result ? result.runId ?? "" : "";
  } catch {
    redirect(`${pagePath}?error=run`);
  }
  revalidatePath(pagePath);
  redirect(`${pagePath}?saved=run&run=${encodeURIComponent(runId)}`);
}

export async function startJourneyBotWindowAction(formData: FormData) {
  const context = await requirePlatformAdmin();
  const configId = readRequired(formData, "configId");
  const hours = readInteger(formData, "hours", 1, 168, 4);
  const admin = createAdminClient();
  const result = await admin
    .from("journey_bot_configs")
    .update({
      enabled: true,
      budget_started_at: new Date().toISOString(),
      journeys_started_total: 0,
      paused: false,
      run_until: new Date(Date.now() + hours * 60 * 60_000).toISOString(),
      next_run_at: new Date().toISOString(),
      updated_by: context.user.id
    })
    .eq("id", configId);
  if (result.error) redirect(`${pagePath}?error=window`);
  try {
    await runJourneyBotConfig(configId, { ignoreSchedule: true, requestedBy: context.user.id });
  } catch {
    redirect(`${pagePath}?error=run`);
  }
  revalidatePath(pagePath);
  redirect(`${pagePath}?saved=window`);
}

export async function resetJourneyBotTestCycleAction(formData: FormData) {
  const context = await requirePlatformAdmin();
  await resetJourneyBotTestCycle(readRequired(formData, "configId"), context.user.id);
  revalidatePath(pagePath);
  redirect(`${pagePath}?saved=reset`);
}

export async function pauseJourneyBotAction(formData: FormData) {
  const context = await requirePlatformAdmin();
  await updateConfigState(readRequired(formData, "configId"), { paused: true, updated_by: context.user.id });
  redirect(`${pagePath}?saved=paused`);
}

export async function resumeJourneyBotAction(formData: FormData) {
  const context = await requirePlatformAdmin();
  await updateConfigState(readRequired(formData, "configId"), {
    enabled: true,
    paused: false,
    next_run_at: new Date().toISOString(),
    updated_by: context.user.id
  });
  redirect(`${pagePath}?saved=resumed`);
}

export async function stopAllJourneyBotsAction() {
  const context = await requirePlatformAdmin();
  await stopAllJourneyBots(context.user.id);
  revalidatePath(pagePath);
  redirect(`${pagePath}?saved=stopped`);
}

export async function archiveJourneyBotRunAction(formData: FormData) {
  const context = await requirePlatformAdmin();
  await archiveJourneyBotRun(readRequired(formData, "runId"), context.user.id);
  revalidatePath(pagePath);
  redirect(`${pagePath}?saved=archived`);
}

export async function resolveJourneyBotIssueAction(formData: FormData) {
  await requirePlatformAdmin();
  const issueId = readRequired(formData, "issueId");
  const admin = createAdminClient();
  const result = await admin
    .from("journey_bot_issues")
    .update({ resolved: true, resolved_at: new Date().toISOString() })
    .eq("id", issueId);
  if (result.error) redirect(`${pagePath}?error=issue`);
  revalidatePath(pagePath);
  redirect(`${pagePath}?saved=issue`);
}

async function updateConfigState(configId: string, values: Record<string, unknown>) {
  const admin = createAdminClient();
  const environment = normalizeJourneyBotEnvironment(process.env.APP_ENV);
  const result = await admin.from("journey_bot_configs").update(values).eq("id", configId).eq("environment", environment);
  if (result.error) redirect(`${pagePath}?error=config`);
  revalidatePath(pagePath);
}

async function requirePlatformAdmin() {
  const context = await requirePrivateShellContext(pagePath);
  if (!context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin")) {
    redirect("/platform?error=forbidden");
  }
  if (!getJourneyBotEnvironmentStatus().allowed) {
    redirect(`${pagePath}?error=environment`);
  }
  return context;
}

function readRequired(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) redirect(`${pagePath}?error=input`);
  return value.trim();
}

function readInteger(formData: FormData, key: string, min: number, max: number, fallback: number) {
  const value = Number.parseInt(String(formData.get(key) ?? ""), 10);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function readScenario(formData: FormData, key: string): JourneyScenarioMode {
  return readEnum(formData, key, journeyScenarioModes, "intake_only");
}

function readEnum<const T extends readonly string[]>(formData: FormData, key: string, allowed: T, fallback: T[number]) {
  const value = formData.get(key);
  return typeof value === "string" && allowed.includes(value) ? (value as T[number]) : fallback;
}

function readActiveDays(formData: FormData) {
  const days = formData
    .getAll("activeDays")
    .map(Number)
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7);
  return days.length ? days : [1, 2, 3, 4, 5];
}

function readTime(formData: FormData, key: string, fallback: string) {
  const value = formData.get(key);
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
