import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { readRuntimeEnvironment, scheduledJobs, validateRuntimeEnvironment } from "./runtime-operations-contract.mjs";

export async function runScheduledJobs(target, environment, { fetchImpl = fetch, log = console.log } = {}) {
  const { url } = validateRuntimeEnvironment(target, environment);
  const failures = [];
  for (const { route, secret } of scheduledJobs(environment)) {
    try {
      const response = await fetchImpl(`${url}${route}`, {
        method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
        body: "{}", signal: AbortSignal.timeout(45_000)
      });
      const result = await response.json();
      if (!response.ok || result.accepted !== true || (result.failed ?? 0) > 0) throw new Error("Job did not complete successfully.");
      log(JSON.stringify({ at: new Date().toISOString(), target, route, status: "pass", processed: result.processed ?? result.claimed ?? result.expired ?? 0 }));
    } catch {
      // Do not echo request credentials or provider response bodies into cron logs.
      log(JSON.stringify({ at: new Date().toISOString(), target, route, status: "fail" }));
      failures.push(route);
    }
  }
  if (failures.length) throw new Error(`${failures.length} scheduled job(s) failed.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const target = process.argv[2];
  const { environment } = readRuntimeEnvironment(target);
  await runScheduledJobs(target, environment);
}
