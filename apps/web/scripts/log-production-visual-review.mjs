#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = resolve(appRoot, "../..");
const manifest = readJson(join(repoRoot, "docs/lovable-baseline/manifest.json"));
const state = readJson(resolve(repoRoot, process.env.PHASE16_STATE_PATH || "artifacts/phase16-state.json"));
const appBaseUrl = process.env.PRODUCTION_BASE_URL || state.appUrl || "https://staging.nxttrack.nl";
const health = await readHealth(appBaseUrl);
const referenceRoot = join(repoRoot, "artifacts/lovable-baseline", manifest.source.commitSha);
const productionRoot = join(resolve(repoRoot, process.env.PRODUCTION_BASELINE_OUTPUT || "artifacts/production-baseline"), health.commitSha);
const browser = await chromium.launch({ headless: true });

try {
  for (const route of manifest.priorityA) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
    const comparisons = manifest.viewports.map((viewport) => ({
      viewport,
      reference: imageDataUrl(join(referenceRoot, route.id, `${viewport.id}.png`)),
      production: imageDataUrl(join(productionRoot, route.id, `${viewport.id}.png`))
    }));

    await page.setContent(renderContactSheet(route, comparisons), { waitUntil: "load" });
    await page.evaluate(async () => {
      await Promise.all([...document.images].map((image) => image.decode()));
      if (document.fonts?.ready) await document.fonts.ready;
    });

    const jpeg = await page.screenshot({ type: "jpeg", quality: 68, fullPage: true, animations: "disabled" });
    emitChunked(route.id, jpeg.toString("base64"));
    await page.close();
  }
} finally {
  await browser.close();
}

function renderContactSheet(route, comparisons) {
  const rows = comparisons.map(({ viewport, reference, production }) => `
    <section>
      <h2>${escapeHtml(viewport.id)} · ${viewport.width}×${viewport.height}</h2>
      <div class="comparison">
        <figure><figcaption>Lovable canon</figcaption><img src="${reference}" alt="Lovable ${escapeHtml(route.id)} ${escapeHtml(viewport.id)}"></figure>
        <figure><figcaption>Live staging</figcaption><img src="${production}" alt="Staging ${escapeHtml(route.id)} ${escapeHtml(viewport.id)}"></figure>
      </div>
    </section>
  `).join("");

  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 32px; background: #e2e8f0; color: #0f172a; font: 16px/1.4 Arial, sans-serif; }
          header { margin-bottom: 24px; }
          h1 { margin: 0 0 6px; font-size: 30px; }
          header p, h2 { margin: 0; color: #475569; }
          section { margin-top: 24px; }
          h2 { margin-bottom: 8px; font-size: 18px; }
          .comparison { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; }
          figure { margin: 0; overflow: hidden; border: 1px solid #cbd5e1; border-radius: 12px; background: white; box-shadow: 0 2px 8px rgb(15 23 42 / 8%); }
          figcaption { padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: 700; }
          img { display: block; width: 100%; height: 520px; object-fit: contain; object-position: top center; background: #f8fafc; }
        </style>
      </head>
      <body>
        <header>
          <h1>${escapeHtml(route.id)}</h1>
          <p>${escapeHtml(route.referenceRoute)} → ${escapeHtml(route.productionRoute)} · ${escapeHtml(route.surface)}</p>
        </header>
        ${rows}
      </body>
    </html>`;
}

function emitChunked(routeId, base64) {
  const chunkSize = 48_000;
  const total = Math.ceil(base64.length / chunkSize);

  for (let index = 0; index < total; index += 1) {
    const chunk = base64.slice(index * chunkSize, (index + 1) * chunkSize);
    console.log(`[visual-review-log] ${routeId} ${index + 1}/${total} ${chunk}`);
  }

  console.log(`[visual-review-log] PASS ${routeId} ${base64.length} base64 characters in ${total} chunk(s).`);
}

function imageDataUrl(path) {
  return `data:image/png;base64,${readFileSync(path).toString("base64")}`;
}

async function readHealth(baseUrl) {
  const response = await fetch(new URL("/api/health", baseUrl));
  if (!response.ok) throw new Error(`Health returned HTTP ${response.status}.`);

  const body = await response.json();
  if (body.ok !== true || !body.commitSha) throw new Error("Health payload is missing a release commit.");
  return body;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
