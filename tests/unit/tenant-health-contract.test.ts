import assert from "node:assert/strict";
import test from "node:test";

import { calculateTenantHealth } from "../../apps/web/lib/domain/tenant-health-contract";

const completeConfiguration = { settings: true, verifiedDomain: true, admin: true, program: true, group: true, resource: true };

test("tenant health is explainable, weighted and healthy with current evidence", () => {
  const health = calculateTenantHealth({
    tenantId: "tenant-1",
    configuredChecks: completeConfiguration,
    mailHealthy: true,
    cron: "pass",
    lastAdminLoginAt: "2026-07-28T10:00:00.000Z",
    openDataIssues: 0,
    criticalDataIssues: 0,
    lowUtilizationGroups: 0,
    activeGroups: 8,
    openIncidents: 0,
    criticalIncidents: 0,
    backup: "pass",
    scanner: "pass",
    adoptedModules: 7,
    availableModules: 7,
    now: new Date("2026-07-29T10:00:00.000Z")
  });
  assert.equal(health.score, 100);
  assert.equal(health.status, "healthy");
  assert.equal(health.components.length, 10);
  assert.equal(health.topActions.length, 0);
  assert.equal(health.components.reduce((sum, component) => sum + component.weight, 0), 100);
});

test("critical incident and failed cron force critical status without hiding evidence", () => {
  const health = calculateTenantHealth({
    tenantId: "tenant-2",
    configuredChecks: { ...completeConfiguration, verifiedDomain: false },
    mailHealthy: false,
    cron: "fail",
    lastAdminLoginAt: null,
    openDataIssues: 4,
    criticalDataIssues: 1,
    lowUtilizationGroups: 3,
    activeGroups: 4,
    openIncidents: 1,
    criticalIncidents: 1,
    backup: "unknown",
    scanner: "degraded",
    adoptedModules: 1,
    availableModules: 7
  });
  assert.equal(health.status, "critical");
  assert.ok(health.score < 60);
  assert.equal(health.topActions.length, 3);
  assert.equal(health.topActions[0].key, "incidents");
  assert.match(health.components.find((component) => component.key === "admin_activity")?.evidence ?? "", /geen bevestigde/i);
});
