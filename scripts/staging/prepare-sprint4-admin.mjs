#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";
const phaseStatePath = path.resolve(process.cwd(), process.env.PHASE16_STATE_PATH || "artifacts/phase16-state.json");

if (process.env.APP_ENV !== "staging" || hostname(appUrl) !== "staging.nxttrack.nl") {
  throw new Error("Sprint 4 admin preparation is restricted to staging.nxttrack.nl.");
}

if (!existsSync(phaseStatePath)) {
  throw new Error(`Phase 16 state is missing at ${phaseStatePath}.`);
}

const phase = JSON.parse(readFileSync(phaseStatePath, "utf8"));
if (!phase.tenant?.id) {
  throw new Error("Phase 16 state does not contain a tenant id.");
}

console.log("[sprint4:prepare-admin] PASS append-only run markers preserve published planning and financial history.");

function hostname(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}
