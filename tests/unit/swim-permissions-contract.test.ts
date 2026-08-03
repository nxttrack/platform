import assert from "node:assert/strict";
import test from "node:test";

import { defaultPermissionsForRole, hasSwimPermission, swimPermissionKeys } from "../../packages/swim-domain/src/permissions";

test("beheerrollen en instructeurs hebben begrensde swim-canonrechten", () => {
  assert.equal(defaultPermissionsForRole("tenant_owner").size, swimPermissionKeys.length);
  assert.equal(hasSwimPermission("instructor", "assessment.record"), true);
  assert.equal(hasSwimPermission("instructor", "curriculum.publish"), false);
  assert.equal(hasSwimPermission("parent", "assessment.record"), false);
  assert.equal(hasSwimPermission("parent", "assessment.read"), true);
});

test("expliciete tenantoverride wint van de rolstandaard", () => {
  assert.equal(hasSwimPermission("instructor", "badge.award", new Map([["badge.award", false]])), false);
  assert.equal(hasSwimPermission("coordinator", "curriculum.publish", new Map([["curriculum.publish", true]])), true);
});
