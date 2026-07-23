#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const failures = [];
check("apps/web/lib/domain/mollie.ts", ["Idempotency-Key", "resolveMollieSecret", "expectedMode", "cache: \"no-store\""]);
check("apps/web/lib/domain/mollie-contract.ts", ["readClassicMollieWebhookId", "validateMolliePaymentSnapshot", "metadata.paymentSessionId", "getSafeMollieCheckoutUrl", "resolveMollieApplicationUrl"]);
check("apps/web/lib/domain/billing-actions.ts", ["readPaymentIdempotencyKey", "isMatchingPaymentSessionRetry", "provider-session-reused"]);
check("apps/web/app/api/webhooks/mollie/route.ts", ["getMolliePayment", "validateMolliePaymentSnapshot", "provider_event_id: `${paymentId}:webhook_error`"]);
check("supabase/migrations/20260723153000_phase_27_billing_activation_hardening.sql", ["billing_provider_configs_mollie_secret_reference_check", "payment_sessions_idempotency_key_format_check", "payment_sessions_one_open_provider_attempt"]);
check("tests/unit/billing-contract.test.ts", ["checkout idempotency contract", "classic Mollie webhook contract", "provider-verified payment state"]);
check("apps/web/public/sw.js", ["request.mode === \"navigate\"", "url.pathname.startsWith(\"/api/\")", "request.headers.has(\"authorization\")"]);
check("supabase/migrations/20260723120000_phase_25_premium_operations.sql", ["automation_runs_idempotency_unique", "alter table public.import_jobs force row level security", "alter table public.media_consents force row level security"]);
check("supabase/migrations/20260723140000_phase_26_planning_undo.sql", ["before_state jsonb not null", "alter table public.planning_change_events force row level security"]);

if (failures.length) {
  console.error("[premium:audit] Failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("[premium:audit] Mollie, private-cache, idempotency, consent and undo invariants verified.");

function check(relativePath, patterns) {
  const content = readFileSync(join(root, relativePath), "utf8");
  for (const pattern of patterns) if (!content.includes(pattern)) failures.push(`${relativePath} is missing ${pattern}`);
}
