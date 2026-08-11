import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const childDomain = source("../../apps/web/lib/domain/child-portal.ts");
const childShell = source("../../apps/web/components/child/child-portal-shell.tsx");
const childMediaRoute = source("../../apps/web/app/api/child/media/[id]/route.ts");
const childSessionRoute = source("../../apps/web/app/api/child/session/route.ts");
const childJourney = source("../../apps/web/components/child/child-journey-map.tsx");
const serviceWorker = source("../../apps/web/public/sw.js");
const securityMigration = source("../../supabase/migrations/20260811120000_parent_child_portal_session_security.sql");
const migration = source("../../supabase/migrations/20260811140000_child_safe_curriculum_media_contract.sql");

test("child DTO is an explicit allowlist and strips assessment internals", () => {
  const dtoContract = childDomain.slice(
    childDomain.indexOf("export type ChildSafeJourneyDto"),
    childDomain.indexOf("export const getChildPortalData")
  );
  assert.doesNotMatch(dtoContract, /\bnote\b|correction|carryover|guardian|billing|email|phone|serial/i);
  assert.doesNotMatch(dtoContract, /CanonicalSwimJourney/);
  assert.match(childDomain, /positiveLabel: childVisible \? observation\.positive_label : null/);
  assert.match(childDomain, /journey: ChildSafeJourneyDto \| null/);
  assert.doesNotMatch(childDomain, /Zwemprogramma|Huidig badje/);
});

test("unearned surprises are absent at the server query boundary", () => {
  assert.match(childDomain, /badge_definition_releases[\s\S]*\.eq\("is_surprise", false\)/);
  assert.match(childDomain, /releaseIds\.length[\s\S]*badge_definition_releases[\s\S]*\.in\("id", releaseIds\)/);
  assert.match(childDomain, /isSurprise: false/);
});

test("child media is approval-bound, inline and has no download capability", () => {
  assert.match(childMediaRoute, /portal_child_media_approvals/);
  assert.match(childMediaRoute, /requestedDownload: false/);
  assert.match(childMediaRoute, /disposition: "inline"/);
  assert.doesNotMatch(childMediaRoute, /searchParams|get\("download"\)/);
  assert.match(migration, /video\/mp4/);
});

test("child shell exposes exactly five primary destinations and expires fail-closed", () => {
  const nav = childShell.slice(childShell.indexOf("const navigation"), childShell.indexOf("export function"));
  assert.equal((nav.match(/href: "\/kind/g) ?? []).length, 5);
  for (const label of ["Vandaag", "Mijn reis", "Badges", "Agenda", "Ik"]) assert.match(nav, new RegExp(`label: "${label}"`));
  assert.match(childShell, /sessionExpiresAt/);
  assert.match(childShell, /\/api\/child\/session/);
  assert.match(childSessionRoute, /requireChildApiAuthenticatedContext/);
});

test("child gebruikt dezelfde Journey Engine-selectie en focus als parent", () => {
  assert.match(childJourney, /selectDefaultJourneyNode/);
  assert.match(childJourney, /orderJourneyNodes/);
  assert.match(childJourney, /focusedJourneyWindow/);
  assert.match(childJourney, /ArrowLeft/);
  assert.match(childJourney, /ArrowRight/);
  assert.match(childJourney, /Math\.abs\(event\.deltaX\) <= Math\.abs\(event\.deltaY\)/);
});

test("push and old tabs follow the global portal mode lock", () => {
  assert.match(childShell, /BroadcastChannel\("nxttrack\.portal-session"\)/);
  assert.match(serviceWorker, /PORTAL_MODE/);
  assert.match(serviceWorker, /if \(mode !== "parent"\) return/);
  assert.match(serviceWorker, /return "locked"/);
});

test("rollout is audited, readiness-gated and direct login remains disabled", () => {
  assert.match(migration, /child_portal_readiness_incomplete/);
  assert.match(migration, /rollout_kill_switch/);
  assert.match(migration, /feature_key = 'swim\.portal\.direct_child_login' then 'disabled'/);
  assert.match(migration, /grant execute on function public\.configure_child_portal_rollout_for_service[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /grant execute on function public\.configure_child_portal_rollout_for_service[\s\S]*to authenticated/);
});

test("Vraag mijn ouder is gestructureerd, resourcegebonden en idempotent", () => {
  assert.match(securityMigration, /request_type in \('lesson_help', 'activity_interest', 'open_parent_portal'\)/);
  assert.match(securityMigration, /current_child_lesson_required/);
  assert.match(securityMigration, /published_child_activity_required/);
  assert.match(securityMigration, /request\.payload_json = p_payload_json/);
  assert.doesNotMatch(securityMigration, /schedule_question|media_question|profile_help|other_safe/);
});

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}
