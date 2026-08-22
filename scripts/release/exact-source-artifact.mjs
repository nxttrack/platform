import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function assertExactSourceSha(candidate, checkoutSha) {
  const sourceSha = String(candidate ?? "").trim().toLowerCase();
  const resolvedCheckoutSha = String(checkoutSha ?? "").trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error("Exact source evidence requires a full 40-character commit SHA.");
  if (!/^[a-f0-9]{40}$/.test(resolvedCheckoutSha)) throw new Error("Checked-out Git HEAD is not a full commit SHA.");
  if (sourceSha !== resolvedCheckoutSha) throw new Error(`Evidence SHA ${sourceSha} does not match checked-out SHA ${resolvedCheckoutSha}.`);
  return sourceSha;
}

export function resolveExactSourceSha(environment = process.env, cwd = process.cwd()) {
  let gitCheckoutSha = "";
  try {
    gitCheckoutSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    // Deployment release directories deliberately exclude .git. In that case
    // the source-boundary step must supply DEPLOYED_SOURCE_SHA explicitly.
  }
  const checkoutSha = gitCheckoutSha || environment.DEPLOYED_SOURCE_SHA || environment.RELEASE_COMMIT_SHA || "";
  const candidate = environment.DEPLOYED_SOURCE_SHA || environment.GITHUB_SHA || environment.RELEASE_COMMIT_SHA || checkoutSha;
  return assertExactSourceSha(candidate, checkoutSha);
}

export function writeExactSourceArtifact({
  environment = process.env,
  outputPath = "artifacts/exact-source-sha.json",
  sourceSha = resolveExactSourceSha(environment)
} = {}) {
  const absolutePath = resolve(process.cwd(), outputPath);
  const artifact = {
    schemaVersion: 1,
    purpose: "nxttrack-exact-source-sha",
    repository: environment.GITHUB_REPOSITORY || null,
    commitSha: sourceSha,
    refName: environment.GITHUB_REF_NAME || null,
    workflowRunId: environment.GITHUB_RUN_ID || null,
    createdAt: new Date().toISOString()
  };
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o640 });
  return { artifact, outputPath: absolutePath };
}
