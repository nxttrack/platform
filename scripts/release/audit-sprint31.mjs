import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const checks = [
  ["supabase/migrations/20260724090000_sprint_31_safe_intake_onboarding_import_offboarding.sql", ["consume_public_intake_rate_limit", "tenant_onboarding_runs", "import_job_events", "tenant_offboarding_runs", "tenant_deletion_tombstones", "force row level security"]],
  ["apps/web/lib/domain/intake-actions.ts", ["companyWebsite", "getRateLimitWindowStart", "possible_duplicate", "createHmac"]],
  ["apps/web/lib/domain/tenant-lifecycle-actions.ts", ["provisionTenantAction", "startTenantOffboardingAction", "closeTenantAccountAction", "approveTenantDeletionAction", "permanentlyDeleteTenantAction"]],
  ["apps/web/lib/domain/import-actions.ts", ["saveImportMappingAction", "validateImportAction", "dryRunImportAction", "applyImportAction", "rollbackImportAction", "rollbackSignature", "timingSafeEqual"]],
  ["apps/web/app/api/platform/offboarding/[id]/export/route.ts", ["nxttrack-tenant-export-v1", "X-Content-SHA256", "includedInline: false"]],
  ["docs/SPRINT_31_IMAGE_PROMPTS.md", ["IMG-31-01", "IMG-31-11", "Vervangingscontract"]],
  ["scripts/staging/seed-sprint31-demo.mjs", ["APP_ENV", "ALLOW_SPRINT31_DEMO_SEED", "Zwemacademie De Waterlijn", "SPRINT31_DEMO"]]
];

const failures = [];
for (const [path, requiredTokens] of checks) {
  const source = await readFile(new URL(path, root), "utf8");
  for (const token of requiredTokens) {
    if (!source.includes(token)) failures.push(`${path}: missing ${token}`);
  }
}

if (failures.length) {
  console.error("[sprint31:audit] Failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(`[sprint31:audit] ${checks.length} lifecycle surfaces verified.`);
