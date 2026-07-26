import { readFileSync } from "node:fs";

const root = process.cwd();
const checks = [
  ["apps/web/lib/domain/journey-bot.ts", ["isJourneyBotEnvironmentAllowed", "suppress_external_notifications", "suppress_real_payments", "claim_journey_bot_config", "computePlacementScores", "blocked_until_eligible", "getJourneyDiplomaMilestone", "DIPLOMA-A", "certificate_records", "journeys_started_total", "technical_failure_count", "resetJourneyBotTestCycle", "purgeJourneyBotRun", "deleteSyntheticJourneyGuardian", "purgeExpiredJourneyBotRuns"]],
  ["apps/web/app/api/internal/journey-bot/tick/route.ts", ["timingSafeEqual", "CRON_SECRET", "runDueJourneyBotConfigs", "summarizeJourneyTick"]],
  ["apps/web/app/(platform-admin)/platform/test-tools/journey-bot/page.tsx", ["Run now", "Run komende uren", "Alles stoppen", "Alle botdata opschonen", "Volledig verwijderen", "Technische health", "Journey logs per kind"]],
  ["scripts/staging/assert-journey-bot-tick.mjs", ["release-blocking technical failures", "unexpectedIssues", "criticalIssues"]],
  ["apps/web/tests/e2e/journey-bot-staging.spec.ts", ["tick endpoint weigert", "full journey, stressmatrix, stopbudget en cleanup", "Alle botdata opschonen", "simulated_recoverable_issue", "20/20"]],
  ["apps/web/tests/e2e/journey-bot-window-control.spec.ts", ["JOURNEY_BOT_WINDOW_HOURS", "full_journey_to_diploma", "realistic", "Run komende uren", "Botstatus"]],
  ["scripts/staging/seed-journey-bot-waterlijn.mjs", ["INSTRUCTIE", "BADJE-1", "BADJE-2", "BADJE-3", "AFZWEM-A", "DIPLOMA-B", "DIPLOMA-C", "KLAAR", "minutesBetween"]],
  ["supabase/migrations/20260724170000_journey_simulation_bot.sql", ["journey_bot_configs", "journey_bot_runs", "journey_bot_child_journeys", "journey_bot_child_events", "journey_bot_issues", "minimum_age_blocked", "is_test"]],
  ["supabase/migrations/20260724183000_journey_bot_trustworthy_outcomes.sql", ["journeys_started_total", "health_status", "outcome_classification", "expected", "claim_journey_bot_config"]],
  ["supabase/migrations/20260725201000_journey_bot_complete_purge.sql", ["journey_bot_purge_receipts", "pending_auth_user_ids", "purge_journey_bot_run", "auth.users", "refused partial completion", "current_user_has_platform_role"]],
  [".env.example", ["CRON_SECRET=placeholder_add_later", "JOURNEY_BOT_DEFAULT_ENABLED=false", "JOURNEY_BOT_EMAIL_DOMAIN=nxttrack.test"]]
];
const errors = [];

for (const [path, needles] of checks) {
  const source = readFileSync(`${root}/${path}`, "utf8");
  for (const needle of needles) {
    if (!source.includes(needle)) errors.push(`${path}: missing ${needle}`);
  }
}

const seed = readFileSync(`${root}/scripts/staging/seed-journey-bot-waterlijn.mjs`, "utf8");
const contract = readFileSync(`${root}/apps/web/lib/domain/journey-bot-contract.ts`, "utf8");
const environmentExample = readFileSync(`${root}/.env.example`, "utf8");
if (!contract.includes('export type JourneyBotEnvironment = "staging"')) {
  errors.push("Journey Bot contract must only admit staging.");
}
if (contract.includes("allowProduction") || environmentExample.includes("ALLOW_JOURNEY_BOT_IN_PRODUCTION")) {
  errors.push("Journey Bot must not expose a production override.");
}
const groupSection = seed.split("const groupSpecs = [")[1]?.split("];")[0] ?? "";
const groupCodes = [...groupSection.matchAll(/\["JB-[A-Z0-9-]+",\s*"/g)];
if (groupCodes.length !== 8) errors.push(`Waterlijn seed must define exactly 8 Journey Bot groups; found ${groupCodes.length}.`);
if (!seed.includes("weekdays.size !== 5") || !seed.includes("minutesBetween(group[5], group[6]) !== 45")) {
  errors.push("Waterlijn seed must enforce five weekdays and 45-minute lessons.");
}
if (!seed.includes("[-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]")) {
  errors.push("Waterlijn seed must provide twelve lessons per group.");
}

if (errors.length) {
  console.error("Journey Bot audit failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Journey Bot audit passed: environment, safety, seed, control plane and test markers are present.");
