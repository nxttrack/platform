import assert from "node:assert/strict";
import test from "node:test";
import { projectChildSafeBadges } from "../../apps/web/lib/domain/child-badges";

const release = (id: string, stable_key: string, overrides = {}) => ({
  id, stable_key, tenant_id: null as string | null, release_number: 1,
  name_default: `Historical ${id}`, name_boy: null as string | null, name_girl: null as string | null,
  category: "progress", audience: "all", is_surprise: false, ...overrides
});
const award = (badge_release_id: string | null, id = "award-1") => ({
  id, badge_release_id, resolved_badge_key: null as string | null, title: "Legacy award title", awarded_at: "2026-08-01T12:00:00Z"
});
const project = (earnedReleases: ReturnType<typeof release>[], standardReleases: ReturnType<typeof release>[],
  overrides: Partial<Parameters<typeof projectChildSafeBadges>[0]> = {}) => projectChildSafeBadges({
  awards: earnedReleases.map((r, i) => award(r.id, `award-${i + 1}`)),
  earnedReleases, standardReleases, gender: "girl", latestAvailabilityByReleaseId: new Map(), ...overrides
});

test("earned current release has no locked duplicate", () => {
  const current = release("current", "floating");
  const result = project([current], [current]);
  assert.equal(result.length, 1);
  assert.equal(result[0].earned, true);
});

test("earned older release covers a newer release with the same stable key and retains history", () => {
  const old = release("old", "floating", { name_girl: "Her historical title" });
  const current = release("current", "floating", { release_number: 2, name_girl: "New title" });
  assert.deepEqual(project([old], [current]), [{
    id: "award-1", title: "Her historical title", category: "progress", earned: true,
    earnedAt: "2026-08-01T12:00:00Z", isSurprise: false
  }]);
});

test("a never-earned stable key remains locked", () => {
  assert.deepEqual(project([], [release("current", "floating")]), [{
    id: "locked:current", title: "Historical current", category: "progress", earned: false,
    earnedAt: null, isSurprise: false
  }]);
});

test("different stable keys remain independent even when titles match", () => {
  const earned = release("earned", "floating", { name_default: "Great work" });
  const other = release("other", "diving", { name_default: "Great work" });
  const result = project([earned], [other, release("new-floating", "floating")]);
  assert.deepEqual(result.map((badge) => [badge.id, badge.earned]), [["award-1", true], ["locked:other", false]]);
});

test("tenant overrides and newer tenant releases share logical earned status", () => {
  const old = release("platform-old", "floating");
  const available = [
    release("platform-new", "floating", { release_number: 99 }),
    release("tenant-old", "floating", { tenant_id: "tenant-a", release_number: 1 }),
    release("tenant-new", "floating", { tenant_id: "tenant-a", release_number: 2 })
  ];
  assert.deepEqual(project([old], available).map((badge) => badge.id), ["award-1"]);
  assert.deepEqual(project([], available).map((badge) => badge.id), ["locked:tenant-new"]);
});

test("earned surprises and legacy history remain visible; unearned surprises never become locked", () => {
  const surprise = release("surprise-old", "secret", { is_surprise: true, name_default: "Historical surprise" });
  const result = project([surprise], [release("surprise-new", "secret", { is_surprise: true }),
    release("hidden-surprise", "never-earned", { is_surprise: true })], {
    awards: [award(surprise.id), award(null, "legacy")]
  });
  assert.deepEqual(result.map((badge) => [badge.id, badge.title, badge.isSurprise, badge.earnedAt]), [
    ["award-1", "Historical surprise", true, "2026-08-01T12:00:00Z"],
    ["legacy", "Legacy award title", false, "2026-08-01T12:00:00Z"]
  ]);
});

test("availability and audience still determine which unearned release is current", () => {
  const available = [release("platform", "floating"),
    release("tenant-unavailable", "floating", { tenant_id: "tenant-a", release_number: 2 }),
    release("boys", "diving", { audience: "boys" })];
  assert.deepEqual(project([], available, { latestAvailabilityByReleaseId: new Map([["tenant-unavailable", "retired"]]) })
    .map((badge) => badge.id), ["locked:platform"]);
});

test("only actually awarded releases contribute earned identities and missing releases retain award data", () => {
  const unattached = release("unattached", "floating");
  const result = project([unattached], [unattached], { awards: [award("missing-release")] });
  assert.deepEqual(result.map((badge) => [badge.id, badge.title, badge.earned]), [
    ["award-1", "Legacy award title", true], ["locked:unattached", "Historical unattached", false]
  ]);
});

test("legacy snapshot keys cover current releases without changing historical award data", () => {
  const legacy = { ...award(null), resolved_badge_key: "floating" };
  const result = project([], [release("current", "floating"), release("other", "diving")], { awards: [legacy] });
  assert.deepEqual(result.map((badge) => [badge.id, badge.earned]), [["award-1", true], ["locked:other", false]]);
  assert.equal(result[0].title, legacy.title);
  assert.equal(result[0].earnedAt, legacy.awarded_at);
});

test("immutable release identity takes precedence over a conflicting legacy snapshot key", () => {
  const earned = release("old", "floating");
  const result = project([earned], [release("current", "floating"), release("other", "diving")], {
    awards: [{ ...award(earned.id), resolved_badge_key: "diving" }]
  });
  assert.deepEqual(result.map((badge) => badge.id), ["award-1", "locked:other"]);
});
