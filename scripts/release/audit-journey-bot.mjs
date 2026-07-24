import { readFileSync } from "node:fs";

const root = process.cwd();
const checks = [
  ["apps/web/lib/domain/journey-bot.ts", ["isJourneyBotEnvironmentAllowed", "suppress_external_notifications", "suppress_real_payments", "claim_journey_bot_config", "computePlacementScores", "blocked_until_eligible", "certificate_records"]],
  ["apps/web/app/api/internal/journey-bot/tick/route.ts", ["timingSafeEqual", "CRON_SECRET", "runDueJourneyBotConfigs"]],
  ["apps/web/app/(platform-admin)/platform/test-tools/journey-bot/page.tsx", ["Run now", "Run komende uren", "Alles stoppen", "Journey logs per kind"]],
  ["scripts/staging/seed-journey-bot-waterlijn.mjs", ["INSTRUCTIE", "BADJE-1", "BADJE-2", "BADJE-3", "AFZWEM-A", "DIPLOMA-B", "DIPLOMA-C", "KLAAR", "minutesBetween"]],
  ["supabase/migrations/20260724170000_journey_simulation_bot.sql", ["journey_bot_configs", "journey_bot_runs", "journey_bot_child_journeys", "journey_bot_child_events", "journey_bot_issues", "minimum_age_blocked", "is_test"]],
  [".env.example", ["CRON_SECRET=placeholder_add_later", "ALLOW_JOURNEY_BOT_IN_PRODUCTION=false", "JOURNEY_BOT_DEFAULT_ENABLED=false", "JOURNEY_BOT_EMAIL_DOMAIN=nxttrack.test"]]
];
const errors = [];

for (const [path, needles] of checks) {
  const source = readFileSync(`${root}/${path}`, "utf8");
  for (const needle of needles) {
    if (!source.includes(needle)) errors.push(`${path}: missing ${needle}`);
  }
}

const seed = readFileSync(`${root}/scripts/staging/seed-journey-bot-waterlijn.mjs`, "utf8");
const groupSection = seed.split("const groupSpecs = [")[1]?.split("];")[0] ?? "";
const groupCodes = [...groupSection.matchAll(/\["JB-[A-Z0-9-]+",\s*"/g)];
if (groupCodes.length !== 8) errors.push(`Waterlijn seed must define exactly 8 Journey Bot groups; found ${groupCodes.length}.`);
if (!seed.includes("weekdays.size !== 5") || !seed.includes("minutesBetween(group[5], group[6]) !== 45")) {
  errors.push("Waterlijn seed must enforce five weekdays and 45-minute lessons.");
}

if (errors.length) {
  console.error("Journey Bot audit failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Journey Bot audit passed: environment, safety, seed, control plane and test markers are present.");
