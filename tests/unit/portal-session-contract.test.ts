import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  CHILD_PORTAL_CONTEXT_VERSION,
  childPortalCapabilities,
  parseChildPortalSessionContext,
  parsePortalSessionContext
} from "../../apps/web/lib/auth/portal-session-contract";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260811120000_parent_child_portal_session_security.sql", import.meta.url),
  "utf8"
);
const proxy = readFileSync(new URL("../../apps/web/proxy.ts", import.meta.url), "utf8");
const serverGuard = readFileSync(new URL("../../apps/web/lib/auth/server-guard.ts", import.meta.url), "utf8");
const serverContext = readFileSync(new URL("../../apps/web/lib/auth/server-context.ts", import.meta.url), "utf8");
const childShell = readFileSync(new URL("../../apps/web/components/child/child-portal-shell.tsx", import.meta.url), "utf8");

describe("session-bound child portal", () => {
  it("publishes exactly the approved capability allowlist", () => {
    assert.deepEqual(childPortalCapabilities, [
      "today.read",
      "journey.read_child_safe",
      "badges.read_child_safe",
      "schedule.read_child_safe",
      "achievements.read_child_safe",
      "approved_media.read_child_safe",
      "child_preferences.write_safe",
      "parent_request.create_safe"
    ]);
  });

  it("parses a session only when every binding and capability is exact", () => {
    const value = {
      mode: "child",
      sessionId: "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222",
      tenantId: "33333333-3333-4333-8333-333333333333",
      participantId: "44444444-4444-4444-8444-444444444444",
      contextVersion: CHILD_PORTAL_CONTEXT_VERSION,
      capabilities: [...childPortalCapabilities],
      expiresAt: "2026-08-11T12:00:00.000Z"
    };
    assert.deepEqual(parseChildPortalSessionContext(value), value);
    assert.equal(parseChildPortalSessionContext({ ...value, contextVersion: 2 }), null);
    assert.equal(parseChildPortalSessionContext({ ...value, capabilities: value.capabilities.slice(1) }), null);
    assert.equal(parseChildPortalSessionContext({ ...value, capabilities: [...value.capabilities, "payments.read"] }), null);
  });

  it("binds mode to a verified auth session and preserves a fail-closed tombstone", () => {
    assert.match(migration, /session_id uuid primary key,/);
    assert.match(migration, /from auth\.sessions session[\s\S]*session\.id = p_session_id and session\.user_id = p_user_id/);
    assert.doesNotMatch(migration, /session_id uuid primary key references auth\.sessions/);
    assert.match(migration, /locked_at timestamptz/);
    assert.match(migration, /mode', case when target\.is_active then 'child' else 'locked'/);
    assert.match(migration, /is_portal_session_restricted/);
    assert.match(migration, /auth_user_id = auth\.uid\(\)/);
    assert.match(migration, /alter role authenticator set pgrst\.db_pre_request/);
    assert.match(migration, /child_session_data_api_blocked/);
    assert.match(migration, /on storage\.objects as restrictive/);
    assert.match(migration, /on realtime\.messages as restrictive/);
    assert.match(migration, /as restrictive for all to authenticated/);
  });

  it("parses expired or revoked rows as locked and never as parent", () => {
    const locked = {
      mode: "locked",
      sessionId: "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222",
      tenantId: "33333333-3333-4333-8333-333333333333",
      participantId: "44444444-4444-4444-8444-444444444444",
      contextVersion: CHILD_PORTAL_CONTEXT_VERSION,
      capabilities: [],
      expiresAt: "2026-08-11T12:00:00.000Z",
      lockedAt: "2026-08-11T12:00:00.000Z",
      lockReason: "expired"
    };
    const { capabilities: _capabilities, ...lockedContext } = locked;
    assert.deepEqual(parsePortalSessionContext(locked), lockedContext);
    assert.deepEqual(parsePortalSessionContext(null), { mode: "parent" });
    assert.equal(parsePortalSessionContext({ mode: "something-else" }), null);
  });

  it("keeps rollout disabled and direct child login disabled by default", () => {
    assert.match(migration, /'swim\.portal\.parent_child_split'/);
    assert.match(migration, /'swim\.portal\.child_mode'/);
    assert.match(migration, /'swim\.portal\.direct_child_login'/);
    assert.match(migration, /'disabled'/);
    assert.match(migration, /child_portal_ttl_not_configured/);
    assert.match(migration, /absoluteTtlMinutes/);
    assert.doesNotMatch(serverGuard, /requestedChildId|searchParams.*kind/);
  });

  it("denies a missing rollout context until a verified parent request initializes it", () => {
    assert.match(migration, /portal_parent_session_contexts/);
    assert.match(migration, /and not exists \([\s\S]*portal_parent_session_contexts/);
    assert.match(migration, /initialize_parent_portal_session_for_service/);
    assert.match(migration, /delete from app_private\.portal_parent_session_contexts/);
    assert.match(serverContext, /initializeParentPortalSession\(context\)/);
  });

  it("requires fresh login with a single-use challenge of at most five minutes", () => {
    assert.match(migration, /expires_at <= created_at \+ interval '5 minutes'/);
    assert.match(migration, /consumed_at is null/);
    assert.match(migration, /parent_reauth_completed/);
    assert.match(childShell, /dataset\.portalSessionTransition === "true"/);
    assert.match(childShell, /onSubmit=\{lockForParentReauthentication\}/);
  });

  it("marks private routes no-store and globally redirects an active child session", () => {
    assert.match(proxy, /Cache-Control/);
    assert.match(proxy, /private, no-store/);
    assert.match(proxy, /X-Robots-Tag/);
    assert.match(proxy, /portalMode === "child" && !isChildAllowedPath/);
    assert.match(proxy, /portalMode === "locked"/);
    assert.match(serverGuard, /portalSession\.mode === "child"/);
    assert.match(serverGuard, /portalSession\.mode === "locked"/);
  });
});
