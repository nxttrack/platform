#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...valueParts] = arg.replace(/^--/, "").split("=");
    return [key, valueParts.join("=") || "true"];
  })
);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const environment = process.env.APP_ENV ?? process.env.NODE_ENV ?? "staging";
const commitSha = process.env.COMMIT_SHA ?? process.env.GITHUB_SHA;
const githubRunId = process.env.GITHUB_RUN_ID ?? "manual";
const status = args.get("status") ?? "activated";
const healthStatus = args.get("health-status") ?? "unknown";

if (!supabaseUrl || !serviceKey || !commitSha) {
  console.warn("[deploy:release-metadata] Skipping release metadata: Supabase URL, service key, or commit SHA is missing.");
  process.exit(0);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const now = new Date().toISOString();
const payload = {
  environment,
  deployment_target: process.env.DEPLOYMENT_TARGET ?? process.env.TARGET ?? null,
  commit_sha: commitSha,
  version: process.env.NEXT_PUBLIC_APP_VERSION ?? null,
  release_path: process.env.RELEASE_PATH ?? process.env.RELEASE ?? null,
  github_run_id: githubRunId,
  github_run_number: process.env.GITHUB_RUN_NUMBER ?? null,
  github_ref_name: process.env.GITHUB_REF_NAME ?? null,
  app_url: process.env.APP_URL ?? null,
  tenant_domain_suffix: process.env.TENANT_DOMAIN_SUFFIX ?? null,
  status,
  health_status: healthStatus,
  activated_at: status === "activated" ? now : undefined,
  verified_at: status === "verified" ? now : undefined,
  metadata: {
    repository: process.env.GITHUB_REPOSITORY ?? null,
    actor: process.env.GITHUB_ACTOR ?? null,
    workflow: process.env.GITHUB_WORKFLOW ?? null
  }
};

const { error } = await supabase.from("deployment_releases").upsert(payload, {
  onConflict: "environment,github_run_id,commit_sha"
});

if (error) {
  console.error(`[deploy:release-metadata] Failed to record release metadata: ${error.message}`);
  process.exit(1);
}

console.log(`[deploy:release-metadata] Recorded ${status}/${healthStatus} for ${environment} ${commitSha.slice(0, 7)}.`);
