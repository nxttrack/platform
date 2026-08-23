import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const checks = [
  ["supabase/migrations/20260724090000_sprint_31_safe_intake_onboarding_import_offboarding.sql", ["consume_public_intake_rate_limit", "tenant_onboarding_runs", "import_job_events", "tenant_offboarding_runs", "tenant_deletion_tombstones", "force row level security"]],
  ["apps/web/lib/domain/intake-actions.ts", ["companyWebsite", "getRateLimitWindowStart", "possible_duplicate", "createHmac"]],
  ["apps/web/lib/domain/tenant-lifecycle-actions.ts", ["provisionTenantAction", "startTenantOffboardingAction", "recordTenantStorageBackupAction", "closeTenantAccountAction", "approveTenantDeletionAction", "permanentlyDeleteTenantAction", "finalizeTenantBackupErasureAction", "eraseExternalTenantProviderData", "eraseExclusiveTenantAuthAccounts"]],
  ["apps/web/lib/domain/import-actions.ts", ["saveImportMappingAction", "validateImportAction", "dryRunImportAction", "applyImportAction", "rollbackImportAction", "claim_import_apply", "apply_import_chunk", "claim_import_rollback", "rollback_import_chunk"]],
  ["supabase/migrations/20260822012255_resumable_import_apply_rollback.sql", ["import_manifest_entries", "claim_import_apply", "apply_import_chunk", "complete_import_apply", "claim_import_rollback", "rollback_import_chunk", "complete_import_rollback"]],
  ["apps/web/app/api/platform/offboarding/[id]/export/route.ts", ["nxttrack-tenant-export-v2", "export_failed", "X-Content-SHA256", "includedInline: false", "exportTenantAuthAccountInventory"]],
  ["apps/web/lib/storage/tenant-erasure.ts", ["listTenantStorageObjects", "eraseTenantStorageObjects", "verifiedRemainingObjects"]],
  ["supabase/migrations/20260725180000_offboarding_erasure_lifecycle.sql", ["export_tenant_dataset", "export_failed", "erasure_attention_required", "backup_retention", "on delete set null"]],
  ["apps/web/lib/security/malware-scanner.ts", ["UPLOAD_MALWARE_SCAN_MODE", "Production uploads require malware scanning", "clamav-instream", "validateFileSignature"]],
  [".github/workflows/deploy.yml", ["UPLOAD_MALWARE_SCAN_MODE", "CLAMAV_SOCKET_PATH", "CLAMAV_HOST", "CLAMAV_PORT"]],
  ["docs/UPLOAD_SECURITY_RUNBOOK.md", ["LocalSocketMode 660", "clamav-daemon", "clamdscan --fdpass", "nxttrack-staging", "nxttrack-production"]],
  ["apps/web/lib/security/content-classification.ts", ["operational", "personal", "sensitive", "restricted", "sanitizeImportedCell"]],
  ["supabase/migrations/20260725190000_content_classification_and_malware.sql", ["content_classification", "malware_scan_status", "legacy_sensitive_keyword"]],
  ["docs/SPRINT_31_IMAGE_PROMPTS.md", ["IMG-31-01", "IMG-31-11", "Vervangingscontract"]],
  ["scripts/staging/seed-sprint31-demo.mjs", ["APP_ENV", "ALLOW_SPRINT31_DEMO_SEED", "Zwemacademie De Waterlijn", "SPRINT31_DEMO", "@demo.nxttrack.test", "Europe/Amsterdam", "seedProgressTimeline", "seedBilling"]],
  ["scripts/staging/verify-sprint31-demo.mjs", ["waterlijn-demo", "expectCount(\"participants\", participants, 48)", "expectCount(\"demo sessions\", sessions, 72)", "@demo.nxttrack.test", "duplicate demo sessions"]],
  [".github/workflows/staging-demo-tenant-seed.yml", ["cron: \"17 4 * * *\"", "staging:verify-demo", "restore managed Waterlijn showcase"]],
  ["scripts/staging/phase-16-operational-flow.mjs", ["nxttrack-e2e", "NXTTRACK technische E2E-fixture", "NXTTRACK E2E"]]
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
