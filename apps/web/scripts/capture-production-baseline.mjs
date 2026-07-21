#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = resolve(appRoot, "../..");
const manifest = readJson(join(repoRoot, "docs/lovable-baseline/manifest.json"));
const statePath = resolve(repoRoot, process.env.PHASE16_STATE_PATH || "artifacts/phase16-state.json");
const state = readJson(statePath);
const appBaseUrl = normalizeBaseUrl(process.env.PRODUCTION_BASE_URL || state.appUrl || "https://staging.nxttrack.nl");
const tenantBaseUrl = normalizeBaseUrl(process.env.PRODUCTION_TENANT_BASE_URL || `https://${state.tenant?.hostname || ""}`);
const health = await readHealth(appBaseUrl);
const releaseSha = health.commitSha;
const expectedReleaseSha = process.env.RELEASE_COMMIT_SHA || process.env.GITHUB_SHA || releaseSha;
const outputRoot = resolve(repoRoot, process.env.PRODUCTION_BASELINE_OUTPUT || "artifacts/production-baseline");
const captureRoot = join(outputRoot, releaseSha);
const captures = [];
const failures = [];

assertPrerequisites();

const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of manifest.viewports) {
    for (const captureGroup of captureGroups()) {
      const routes = manifest.priorityA.filter((route) => captureGroup.surfaces.includes(route.surface));

      if (routes.length === 0) continue;

      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        colorScheme: "light",
        reducedMotion: "reduce"
      });
      const page = await context.newPage();
      let runtimeFailures = [];

      page.on("pageerror", (error) => runtimeFailures.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error" && !isGenericResourceNoise(message.text())) {
          runtimeFailures.push(`console: ${message.text()}`);
        }
      });
      page.on("response", (response) => {
        if (response.status() >= 400 && !isGenericResourceNoise(response.url())) {
          runtimeFailures.push(`response ${response.status()}: ${response.url()}`);
        }
      });

      try {
        if (captureGroup.role) {
          await signIn(page, captureGroup.role, tenantBaseUrl);
        }

        for (const route of routes) {
          runtimeFailures = [];
          const productionPath = resolveProductionPath(route.productionRoute);
          const baseUrl = route.surface === "marketing" ? appBaseUrl : tenantBaseUrl;
          const url = `${baseUrl}${productionPath}`;
          const relativeImagePath = join(route.id, `${viewport.id}.png`);
          const imagePath = join(captureRoot, relativeImagePath);
          mkdirSync(dirname(imagePath), { recursive: true });

          try {
            const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

            if (!response || !response.ok()) {
              throw new Error(`navigation returned ${response?.status() ?? "no response"}`);
            }

            if (new URL(page.url()).pathname === "/login") {
              throw new Error(`authentication did not persist for ${route.productionRoute}`);
            }

            await settlePage(page);
            await assertExpectedSurface(page, route);
            await page.screenshot({ path: imagePath, fullPage: true, animations: "disabled" });

            const image = readFileSync(imagePath);
            const entry = {
              routeId: route.id,
              referenceRoute: route.referenceRoute,
              productionRoute: productionPath,
              surface: route.surface,
              viewport: viewport.id,
              width: viewport.width,
              height: viewport.height,
              path: relativeImagePath,
              bytes: image.byteLength,
              sha256: createHash("sha256").update(image).digest("hex"),
              runtimeFailures: [...runtimeFailures]
            };
            captures.push(entry);

            if (runtimeFailures.length > 0) {
              failures.push(`${productionPath} (${viewport.id}): ${runtimeFailures.join(" | ")}`);
            }

            console.log(`[design:capture-production] ${productionPath} ${viewport.id} ${entry.sha256.slice(0, 12)}`);
          } catch (error) {
            failures.push(`${productionPath} (${viewport.id}): ${formatError(error)}`);
          }
        }
      } catch (error) {
        for (const route of routes) {
          failures.push(`${route.productionRoute} (${viewport.id}): ${captureGroup.role || captureGroup.id} setup failed: ${formatError(error)}`);
        }
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}

const evidence = {
  schemaVersion: 1,
  reference: manifest.source,
  release: {
    commitSha: releaseSha,
    expectedCommitSha: expectedReleaseSha,
    appBaseUrl,
    tenantBaseUrl,
    environment: health.env ?? health.environment ?? "unknown",
    buildTimestamp: health.buildTimestamp ?? null
  },
  phase16StatePath: statePath,
  browser: "chromium",
  createdAt: new Date().toISOString(),
  expectedCaptureCount: manifest.priorityA.length * manifest.viewports.length,
  captureCount: captures.length,
  failureCount: failures.length,
  captures,
  failures
};

mkdirSync(captureRoot, { recursive: true });
writeFileSync(join(captureRoot, "capture.json"), `${JSON.stringify(evidence, null, 2)}\n`);

if (failures.length > 0 || captures.length !== evidence.expectedCaptureCount) {
  console.error(`[design:capture-production] FAIL ${captures.length}/${evidence.expectedCaptureCount} captures, ${failures.length} failure(s).`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`[design:capture-production] PASS ${captures.length} screenshots for ${releaseSha} written to ${captureRoot}.`);

function captureGroups() {
  return [
    { id: "tenant-public", surfaces: ["tenant-public"] },
    { id: "parent", role: "parent", surfaces: ["parent"] },
    { id: "instructor", role: "instructor", surfaces: ["instructor"] },
    { id: "tenant-admin", role: "tenantAdmin", surfaces: ["tenant-admin"] },
    { id: "marketing", surfaces: ["marketing"] }
  ];
}

async function signIn(page, role, baseUrl) {
  const credential = credentials()[role];
  const nextPath = role === "parent" ? "/portaal" : role === "instructor" ? "/instructor" : "/admin";

  await page.goto(`${baseUrl}/login?next=${encodeURIComponent(nextPath)}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.locator("input[name='email']").fill(credential.email);
  await page.locator("input[name='password']").fill(credential.password);
  await page.getByRole("button", { name: /inloggen/i }).click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);

  const currentPath = new URL(page.url()).pathname;
  if (currentPath === "/login" || currentPath === "/auth/wachtwoord-wijzigen") {
    throw new Error(`${role} sign-in ended on ${currentPath}`);
  }
}

function credentials() {
  return {
    parent: requiredCredential("E2E_PARENT", state.users?.parent?.email),
    instructor: requiredCredential("E2E_INSTRUCTOR", state.users?.instructor?.email),
    tenantAdmin: requiredCredential("E2E_TENANT_ADMIN", state.users?.tenantAdmin?.email)
  };
}

function requiredCredential(prefix, fallbackEmail) {
  const email = process.env[`${prefix}_EMAIL`] || fallbackEmail;
  const password = process.env[`${prefix}_PASSWORD`];

  if (!email || !password) {
    throw new Error(`${prefix}_EMAIL and ${prefix}_PASSWORD are required.`);
  }

  return { email, password };
}

function resolveProductionPath(route) {
  return route.replace("[id]", route.includes("/group/") ? requiredState("expected.groupId") : requiredState("expected.participantId"));
}

function requiredState(path) {
  const value = path.split(".").reduce((current, key) => current?.[key], state);

  if (typeof value !== "string" || !value) {
    throw new Error(`Phase 16 state is missing ${path}.`);
  }

  return value;
}

async function settlePage(page) {
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  await page.addStyleTag({ content: "*, *::before, *::after { caret-color: transparent !important; }" });
  await page.waitForTimeout(250);
}

async function assertExpectedSurface(page, route) {
  if (route.surface !== "tenant-public") return;

  const body = await page.locator("body").innerText();
  const expectedProgram = state.expected?.programName;

  if (body.includes("Open deze pagina via een tenant-subdomain") || body.includes("NXTTRACK platform")) {
    throw new Error(`tenant host resolved to a platform or unavailable page for ${route.productionRoute}`);
  }

  if (!expectedProgram || !body.includes(expectedProgram)) {
    throw new Error(`tenant page ${route.productionRoute} does not contain seeded program '${expectedProgram ?? "missing"}'`);
  }
}

async function readHealth(baseUrl) {
  const response = await fetch(`${baseUrl}/api/health`);

  if (!response.ok) {
    throw new Error(`Health endpoint returned ${response.status}.`);
  }

  return response.json();
}

function assertPrerequisites() {
  if (!/^[a-f0-9]{40}$/.test(releaseSha || "")) {
    throw new Error("Live health must expose a full release commit SHA.");
  }

  if (releaseSha !== expectedReleaseSha) {
    throw new Error(`Live release ${releaseSha} does not match expected release ${expectedReleaseSha}.`);
  }

  if (!state.tenant?.hostname || !state.expected?.groupId || !state.expected?.participantId) {
    throw new Error("Phase 16 state must contain the tenant hostname, group id and participant id.");
  }

  credentials();
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Could not read JSON file ${path}: ${formatError(error)}`);
  }
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function isGenericResourceNoise(value) {
  return value.toLowerCase().includes("favicon");
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
