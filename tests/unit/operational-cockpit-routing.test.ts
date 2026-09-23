import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const cockpit = readFileSync(new URL("../../apps/web/components/admin/daily-operational-cockpit.tsx", import.meta.url), "utf8");
const actions = readFileSync(new URL("../../apps/web/lib/domain/operational-cockpit-actions.ts", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../../apps/web/components/admin/tenant-admin-dashboard.tsx", import.meta.url), "utf8");

test("operational signal routing stays within the dedicated work queue", () => {
  assert.match(cockpit, /`\/admin\/signalen\?filter=\$\{value\}`/);
  assert.match(actions, /const path = "\/admin\/signalen"/);
  assert.match(actions, /redirect\(`\$\{path\}\?error=forbidden`\)/);
  assert.match(actions, /revalidatePath\("\/admin"\);\s*revalidatePath\(path\);/);
  assert.match(dashboard, /href="\/admin\/signalen"[^>]*>Open signalenwerkbak/);
});
