#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = resolve(appRoot, "../..");
const manifestPath = join(repoRoot, "docs/lovable-baseline/manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const baseUrl = normalizeBaseUrl(process.env.LOVABLE_BASE_URL || "http://127.0.0.1:4173");
const outputRoot = resolve(repoRoot, process.env.LOVABLE_BASELINE_OUTPUT || "artifacts/lovable-baseline");
const commitSha = manifest.source.commitSha;
const captureRoot = join(outputRoot, commitSha);
const browser = await chromium.launch({ headless: true });
const captures = [];
const failures = [];

try {
  for (const route of manifest.priorityA) {
    for (const viewport of manifest.viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        colorScheme: "light",
        reducedMotion: "reduce"
      });
      const page = await context.newPage();
      const runtimeFailures = [];

      page.on("pageerror", (error) => runtimeFailures.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error" && !isGenericResourceNoise(message.text())) {
          runtimeFailures.push(`console: ${message.text()}`);
        }
      });
      page.on("response", (response) => {
        if (response.status() >= 400 && !response.url().toLowerCase().includes("favicon")) {
          runtimeFailures.push(`response ${response.status()}: ${response.url()}`);
        }
      });

      const url = `${baseUrl}${route.referenceRoute}`;
      const relativeImagePath = join(route.id, `${viewport.id}.png`);
      const imagePath = join(captureRoot, relativeImagePath);
      mkdirSync(dirname(imagePath), { recursive: true });

      try {
        const response = await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
        if (!response || !response.ok()) {
          throw new Error(`navigation returned ${response?.status() ?? "no response"}`);
        }

        await page.evaluate(async () => {
          if (document.fonts?.ready) {
            await document.fonts.ready;
          }
        });
        await page.waitForTimeout(250);
        await page.screenshot({ path: imagePath, fullPage: true, animations: "disabled" });

        const image = readFileSync(imagePath);
        const entry = {
          routeId: route.id,
          route: route.referenceRoute,
          viewport: viewport.id,
          width: viewport.width,
          height: viewport.height,
          path: relativeImagePath,
          bytes: image.byteLength,
          sha256: createHash("sha256").update(image).digest("hex"),
          runtimeFailures
        };
        captures.push(entry);

        if (runtimeFailures.length > 0) {
          failures.push(`${route.referenceRoute} (${viewport.id}): ${runtimeFailures.join(" | ")}`);
        }

        console.log(`[design:capture] ${route.referenceRoute} ${viewport.id} ${entry.sha256.slice(0, 12)}`);
      } catch (error) {
        failures.push(`${route.referenceRoute} (${viewport.id}): ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}

const captureEvidence = {
  schemaVersion: 1,
  source: manifest.source,
  baseUrl,
  browser: "chromium",
  createdAt: new Date().toISOString(),
  expectedCaptureCount: manifest.priorityA.length * manifest.viewports.length,
  captureCount: captures.length,
  failureCount: failures.length,
  captures,
  failures
};

mkdirSync(captureRoot, { recursive: true });
writeFileSync(join(captureRoot, "capture.json"), `${JSON.stringify(captureEvidence, null, 2)}\n`);

if (failures.length > 0 || captures.length !== captureEvidence.expectedCaptureCount) {
  console.error(`[design:capture] FAIL ${captures.length}/${captureEvidence.expectedCaptureCount} captures, ${failures.length} failure(s).`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`[design:capture] PASS ${captures.length} screenshots written to ${captureRoot}.`);

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function isGenericResourceNoise(message) {
  const normalized = message.toLowerCase();
  return normalized.includes("favicon") || normalized.includes("failed to load resource: the server responded with a status of 404");
}
