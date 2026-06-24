#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const steps = [
  ["corepack", ["pnpm", "typecheck"], "TypeScript"],
  ["corepack", ["pnpm", "run", "auth:audit"], "auth boundaries"],
  ["corepack", ["pnpm", "run", "db:audit"], "migration/RLS contracts"],
  ["corepack", ["pnpm", "run", "security:audit"], "release security readiness"],
  ["corepack", ["pnpm", "build"], "production build"],
  ["node", ["scripts/deploy/prepare-standalone-assets.mjs"], "standalone static assets"],
  ["corepack", ["pnpm", "run", "db:migrate"], "migration command guard"]
];

for (const [command, args, label] of steps) {
  console.log(`[release:gate] Checking ${label}...`);

  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (result.status !== 0) {
    console.error(`[release:gate] ${label} failed.`);
    process.exit(result.status ?? 1);
  }
}

console.log("[release:gate] Phase 13 release gate passed.");
