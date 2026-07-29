import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveInvitationTenantSlug } from "../../apps/web/lib/auth/invitation-target";

describe("invitation tenant targeting", () => {
  it("never inherits an active tenant inside the platform shell", () => {
    assert.equal(resolveInvitationTenantSlug({
      activeTenantSlug: "waterlijn-demo",
      explicitTenantSlug: null,
      shell: "platform"
    }), null);
  });

  it("keeps an explicit target so role and tenant validation can reject mismatches", () => {
    assert.equal(resolveInvitationTenantSlug({
      activeTenantSlug: "other-tenant",
      explicitTenantSlug: " Waterlijn-Demo ",
      shell: "platform"
    }), "waterlijn-demo");
  });

  it("inherits the active tenant for an organization-admin invitation", () => {
    assert.equal(resolveInvitationTenantSlug({
      activeTenantSlug: "waterlijn-demo",
      explicitTenantSlug: null,
      shell: "admin"
    }), "waterlijn-demo");
  });
});
