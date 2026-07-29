import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const engagement = read("supabase/migrations/20260729180000_premium_engagement_foundation.sql");
const governance = read("supabase/migrations/20260729190000_audit_support_and_dashboard_preferences.sql");
const seasons = read("supabase/migrations/20260729200000_seasonal_planning.sql");
const summaries = read("supabase/migrations/20260729210000_management_summary_drafts.sql");
const pushSubscription = read("apps/web/app/api/push/subscription/route.ts");
const pushTest = read("apps/web/app/api/push/test/route.ts");
const diplomaRoute = read("apps/web/app/diploma-verificatie/[code]/page.tsx");
const supportActions = read("apps/web/lib/domain/support-access-actions.ts");
const auditExplorer = read("apps/web/lib/domain/audit-explorer.ts");
const managementRoute = read("apps/web/app/api/internal/management-summaries/weekly/route.ts");

test("engagement tables are tenant scoped, forced through RLS and preserve human control", () => {
  for (const table of ["tenant_feedback_campaigns", "feedback_survey_requests", "feedback_survey_responses", "web_push_subscriptions", "web_push_preferences"]) {
    assert.match(engagement, new RegExp(`alter table public\\.${table} force row level security`));
  }
  assert.match(engagement, /guardian_user_id = auth\.uid\(\)/);
  assert.match(engagement, /status = 'open'[\s\S]+expires_at > now\(\)/);
  assert.match(engagement, /verification_public_id uuid not null default gen_random_uuid/);
  assert.match(diplomaRoute, /privacySafe|verifyPublicCertificate/);
});

test("web push is explicit, self-managed and has no anonymous subscription path", () => {
  assert.match(pushSubscription, /requireApiAuthenticatedContext/);
  assert.match(pushSubscription, /consent_recorded_at/);
  assert.match(pushSubscription, /protocol === "https:"/);
  assert.match(pushTest, /requireApiAuthenticatedContext/);
  assert.match(pushTest, /sendWebPushToUser/);
  assert.doesNotMatch(pushSubscription, /service_role.*client/i);
});

test("support access is two-party, short lived and read-only", () => {
  assert.match(governance, /scope in \('diagnostics_read_only'\)/);
  assert.match(governance, /duration_minutes between 15 and 120/);
  assert.match(governance, /status = 'active' and approved_by_user_id is not null/);
  assert.match(governance, /platform_support_one_pending_idx/);
  assert.match(supportActions, /humanConfirmation"\) !== decision/);
  assert.match(supportActions, /platform_admin_audit_events/);
  assert.doesNotMatch(supportActions, /tenant_memberships.*insert/);
});

test("audit explorer redacts secrets and dashboard preferences cannot change authorization", () => {
  assert.match(auditExplorer, /password\|secret\|token\|api\.\?key\|authorization\|cookie/);
  assert.match(governance, /Users manage own dashboard widgets/);
  assert.match(governance, /user_id = auth\.uid\(\)/);
  assert.doesNotMatch(governance, /dashboard_widget_preferences[\s\S]+role_key/);
});

test("seasonal changes are atomic, confirmed in the app and recoverable", () => {
  for (const table of ["planning_seasons", "season_blackout_periods", "season_schedule_change_events"]) {
    assert.match(seasons, new RegExp(`alter table public\\.${table} force row level security`));
  }
  assert.match(seasons, /create function app_private\.publish_season_blackout/);
  assert.match(seasons, /create function app_private\.undo_season_blackout/);
  assert.match(seasons, /and session\.status = event\.after_status/);
  assert.doesNotMatch(seasons, /grant execute on function app_private\.publish_season_blackout[^;]+authenticated/);
});

test("management summaries remain rule-based drafts behind the internal job gate", () => {
  assert.match(summaries, /generation_method text not null default 'rule_based'/);
  assert.match(summaries, /status text not null default 'draft'/);
  assert.match(summaries, /approval never sends it/i);
  assert.match(managementRoute, /INTERNAL_JOBS_ENABLED !== "true"/);
  assert.match(managementRoute, /hasValidCronSecret/);
  assert.match(managementRoute, /generateManagementSummaryDraft/);
});
