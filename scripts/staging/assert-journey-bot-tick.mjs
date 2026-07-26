import { readFile } from "node:fs/promises";

const responsePath = process.argv[2];
if (!responsePath) throw new Error("Usage: node scripts/staging/assert-journey-bot-tick.mjs <response.json>");

const payload = JSON.parse(await readFile(responsePath, "utf8"));
if (payload.accepted !== true || payload.environment !== "staging") {
  throw new Error(`Journey Bot tick was not safely accepted: ${JSON.stringify(payload)}`);
}

const summary = payload.summary;
if (!summary || typeof summary !== "object") {
  throw new Error("Journey Bot tick response has no trustworthy summary.");
}

const numeric = (key) => {
  const value = summary[key];
  if (!Number.isInteger(value) || value < 0) throw new Error(`Journey Bot tick summary.${key} is invalid.`);
  return value;
};

const failedRuns = numeric("failedRuns");
const technicalFailures = numeric("technicalFailures");
const criticalIssues = numeric("criticalIssues");
const degradedJourneys = numeric("degradedJourneys");
const unexpectedIssues = numeric("unexpectedIssues");
const healthyRuns = numeric("healthyRuns");

console.log(
  `[journey-bot:tick] processed=${payload.processed} healthy=${healthyRuns} degraded=${degradedJourneys} technical=${technicalFailures} unexpectedIssues=${unexpectedIssues} critical=${criticalIssues}`
);

if (failedRuns > 0 || technicalFailures > 0 || criticalIssues > 0) {
  throw new Error(
    `Journey Bot tick contains release-blocking technical failures: failedRuns=${failedRuns}, technicalFailures=${technicalFailures}, criticalIssues=${criticalIssues}.`
  );
}

if (degradedJourneys > 0 || unexpectedIssues > 0) {
  console.log(
    `::warning title=Journey Bot degraded::${degradedJourneys} degraded journey(s), ${unexpectedIssues} unexpected issue(s). Inspect the platform control plane.`
  );
}
