import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

export function runtimeTarget(target) {
  assert.ok(["staging", "production"].includes(target), "An explicit staging or production target is required.");
  return { target, base: `/var/www/nxttrack/${target}`, shared: `/var/www/nxttrack/${target}/shared`,
    url: target === "production" ? "https://nxttrack.nl" : "https://staging.nxttrack.nl" };
}

export function validateRuntimeEnvironment(target, environment) {
  const config = runtimeTarget(target);
  assert.equal(environment.APP_ENV, target, "Runtime environment does not match the requested target.");
  assert.equal(environment.APP_URL, config.url, "Runtime URL does not match the requested target.");
  assert.match(environment.RELEASE_COMMIT_SHA ?? "", /^[a-f0-9]{40}$/, "Runtime release identity is missing.");
  return config;
}

export function readRuntimeEnvironment(target) {
  const config = runtimeTarget(target);
  const environment = parseEnv(readFileSync(`${config.shared}/.env`, "utf8"));
  validateRuntimeEnvironment(target, environment);
  return { ...config, environment };
}

export function scheduledJobs(environment) {
  if (environment.MAINTENANCE_NO_WRITE === "true" || environment.INTERNAL_JOBS_ENABLED !== "true") return [];
  const jobs = [
    { route: "/api/internal/portal-themes/activate-scheduled", secret: environment.CRON_SECRET },
    { route: "/api/internal/offerings/expire", secret: environment.BILLING_AUTOMATION_SECRET }
  ];
  if (environment.EMAIL_SENDING_ENABLED === "true") jobs.push({ route: "/api/internal/email-outbox/process", secret: environment.CRON_SECRET });
  for (const job of jobs) assert.ok(job.secret?.length >= 32, "Scheduled job authentication is missing.");
  return jobs;
}

export function shellQuote(value) {
  assert.ok(!/[\r\n%]/.test(value), "Unsafe cron argument.");
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function cronEntries(target, nodePath, shared = runtimeTarget(target).shared) {
  const run = (file) => `${shellQuote(nodePath)} ${shellQuote(`${shared}/operations-v4/current/scripts/operations/${file}`)} ${target}`;
  return [
    `* * * * * /usr/bin/flock -n ${shellQuote(`${shared}/v4-recurring-jobs.lock`)} ${run("run-scheduled-jobs.mjs")} >> ${shellQuote(`${shared}/v4-recurring-jobs.log`)} 2>&1 # nxttrack-v4-${target}`,
    `${target === "production" ? 17 : 37} 2 * * * /usr/bin/flock -n ${shellQuote(`${shared}/v4-storage-backup.lock`)} ${run("backup-storage-daily.mjs")} >> ${shellQuote(`${shared}/v4-storage-backup.log`)} 2>&1 # nxttrack-v4-storage-${target}`
  ];
}

export function reconcileCrontab(existing, target, entries) {
  runtimeTarget(target);
  const tags = [`# nxttrack-v4-${target}`, `# nxttrack-v4-storage-${target}`];
  const retained = existing.split(/\r?\n/).filter((line) => !tags.some((tag) => line.trimEnd().endsWith(tag)));
  while (retained.at(-1) === "") retained.pop();
  return [...retained, ...entries, ""].join("\n");
}
