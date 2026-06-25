#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const failures = [];
const warnings = [];

auditLovableBaseline();
auditForbiddenCopy();
auditImages();
auditForms();
auditNavigationAndFocus();
auditResponsiveContracts();

if (warnings.length > 0) {
  console.warn("[ui:audit] Warnings:");

  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }
}

if (failures.length > 0) {
  console.error("[ui:audit] Accessibility/responsive/Lovable audit failed:");

  for (const failure of failures) {
    console.error(`- ${failure}`);
  }

  process.exit(1);
}

console.log("[ui:audit] Accessibility/responsive/Lovable audit passed.");

function auditLovableBaseline() {
  const requiredDocs = [
    "docs/PHASE_1_LOVABLE_UI_AUDIT.md",
    "docs/LOVABLE_SCREENSHOT_BASELINE.md",
    "docs/LOVABLE_MARKETING_PORT.md"
  ];

  for (const doc of requiredDocs) {
    if (!existsSync(join(root, doc))) {
      fail(`${doc} is required for Lovable visual QA traceability.`);
    }
  }
}

function auditForbiddenCopy() {
  const forbiddenCopy = [
    "Phase 2 scaffold",
    "Phase 2 blijft bewust klein",
    "Bestand/download wordt in een latere fase gekoppeld",
    "nog geen productdata"
  ];
  const scanRoots = [
    "apps/web/app/(tenant-public)",
    "apps/web/app/(tenant-admin)",
    "apps/web/app/(parent)",
    "apps/web/app/(instructor)",
    "apps/web/components"
  ];

  for (const scanRoot of scanRoots) {
    scanFiles(join(root, scanRoot), (filePath, source) => {
      const projectPath = normalizePath(relative(root, filePath));

      for (const copy of forbiddenCopy) {
        if (source.toLowerCase().includes(copy.toLowerCase())) {
          fail(`${projectPath} contains stale scaffold copy: "${copy}".`);
        }
      }
    });
  }
}

function auditImages() {
  scanFiles(join(root, "apps/web"), (filePath, source) => {
    const projectPath = normalizePath(relative(root, filePath));
    const imgTags = source.match(/<img\b[^>]*>/g) ?? [];

    for (const tag of imgTags) {
      if (!/\salt=/.test(tag)) {
        fail(`${projectPath} has an <img> without alt text.`);
      }
    }
  });
}

function auditForms() {
  scanFiles(join(root, "apps/web/components"), (filePath, source) => {
    const projectPath = normalizePath(relative(root, filePath));
    const inputCount = (source.match(/<input\b/g) ?? []).length;
    const selectCount = (source.match(/<select\b/g) ?? []).length;
    const textareaCount = (source.match(/<textarea\b/g) ?? []).length;
    const labelCount = (source.match(/<label\b/g) ?? []).length;

    if (inputCount + selectCount + textareaCount > 0 && labelCount === 0) {
      fail(`${projectPath} contains form controls without label wrappers.`);
    }
  });
}

function auditResponsiveContracts() {
  const responsiveFiles = [
    "apps/web/components/public-site/tenant-public-pages.tsx",
    "apps/web/components/operations/admin-phase12-pages.tsx",
    "apps/web/components/payments/admin-payments-page.tsx",
    "apps/web/components/parent-portal/parent-portal-pages.tsx",
    "apps/web/components/instructor-portal/instructor-portal-pages.tsx",
    "apps/web/components/shell/app-shell.tsx"
  ];

  for (const file of responsiveFiles) {
    const source = readProjectFile(file);

    if (!/\b(?:sm|md|lg|xl):/.test(source)) {
      fail(`${file} must contain responsive breakpoint classes.`);
    }

    if (/text-\[[^\]]*(?:vw|vh|vmin|vmax)/.test(source)) {
      fail(`${file} must not scale font size with viewport units.`);
    }

    if (/tracking-\[?-\d/.test(source)) {
      fail(`${file} must not use negative letter spacing.`);
    }
  }
}

function auditNavigationAndFocus() {
  const navigationFiles = [
    "apps/web/components/shell/app-shell.tsx",
    "apps/web/components/public-site/tenant-public-pages.tsx",
    "apps/web/components/parent-portal/parent-portal-pages.tsx",
    "apps/web/components/instructor-portal/instructor-portal-pages.tsx"
  ];

  for (const file of navigationFiles) {
    const source = readProjectFile(file);

    if (source.includes("<nav") && !source.includes("aria-label")) {
      fail(`${file} contains navigation without an aria-label.`);
    }

    if (!source.includes("focus:ring") && !source.includes("focus-visible")) {
      fail(`${file} must define visible focus states for interactive controls.`);
    }
  }

  const contrastSensitiveFiles = [
    "apps/web/components/public-site/tenant-public-pages.tsx",
    "apps/web/components/shell/app-shell.tsx"
  ];

  for (const file of contrastSensitiveFiles) {
    const source = readProjectFile(file);

    if (/text-(?:white|slate-50|gray-50)[^"]*bg-(?:white|slate-50|gray-50)/.test(source)) {
      fail(`${file} may contain low-contrast light text on a light background.`);
    }
  }
}

function scanFiles(directory, visit) {
  if (!existsSync(directory)) {
    return;
  }

  for (const entry of readdirSync(directory)) {
    const absolutePath = join(directory, entry);
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      if (!["node_modules", ".next", "dist", "coverage"].includes(entry)) {
        scanFiles(absolutePath, visit);
      }

      continue;
    }

    if (!/\.(?:ts|tsx|js|jsx)$/.test(entry)) {
      continue;
    }

    visit(absolutePath, readFileSync(absolutePath, "utf8"));
  }
}

function readProjectFile(file) {
  const absolutePath = join(root, file);

  if (!existsSync(absolutePath)) {
    fail(`Missing required UI file: ${file}`);
    return "";
  }

  return readFileSync(absolutePath, "utf8");
}

function normalizePath(value) {
  return value.replaceAll("\\", "/");
}

function fail(message) {
  failures.push(message);
}
