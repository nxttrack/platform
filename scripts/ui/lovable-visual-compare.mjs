#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];

const visualContracts = [
  {
    label: "NXTTRACK marketing page",
    file: "apps/web/components/marketing/nxttrack-marketing.tsx",
    snippets: ["NXTTRACK", "moderne zwemscholen", "bg-gradient", "rounded-3xl", "shadow-xl", "md:"]
  },
  {
    label: "Tenant public homepage",
    file: "apps/web/components/public-site/tenant-public-pages.tsx",
    snippets: ["heroImageUrl", "heroTitle", "gradient-navy", "rounded-3xl", "shadow-card", "Programma", "Intake", "md:"]
  },
  {
    label: "Program overview and detail",
    file: "apps/web/components/public-site/tenant-public-pages.tsx",
    snippets: ["ProgramOverviewPage", "ProgramDetailPage", "program.intakeConfig", "IntakeForm", "grid", "lg:"]
  },
  {
    label: "Mobile-first parent shell",
    file: "apps/web/components/parent-portal/parent-portal-pages.tsx",
    snippets: ["rounded-3xl", "shadow-soft", "Mijn lessen", "Notificaties", "md:"]
  },
  {
    label: "Mobile-first instructor shell",
    file: "apps/web/components/instructor-portal/instructor-portal-pages.tsx",
    snippets: ["Aanwezigheid", "Groepslijst", "Voortgang beoordelen", "rounded-2xl", "md:"]
  },
  {
    label: "Admin sidebar visual grouping",
    file: "apps/web/lib/navigation.ts",
    snippets: ["section", "Instroom", "Planning", "Mensen", "Communicatie", "Financieel & inzicht"]
  }
];

const docs = [
  "docs/PHASE_1_LOVABLE_UI_AUDIT.md",
  "docs/LOVABLE_SCREENSHOT_BASELINE.md",
  "docs/LOVABLE_MARKETING_PORT.md"
];

for (const doc of docs) {
  if (!existsSync(join(root, doc))) {
    fail(`${doc} is required before Lovable visual comparison can run.`);
  }
}

for (const contract of visualContracts) {
  const source = readProjectFile(contract.file);

  for (const snippet of contract.snippets) {
    if (!source.includes(snippet)) {
      fail(`${contract.label}: missing visual marker "${snippet}" in ${contract.file}.`);
    }
  }
}

if (failures.length > 0) {
  console.error("[ui:lovable] Lovable visual comparison failed:");

  for (const failure of failures) {
    console.error(`- ${failure}`);
  }

  process.exit(1);
}

console.log("[ui:lovable] Lovable visual comparison passed.");

function readProjectFile(file) {
  const absolutePath = join(root, file);

  if (!existsSync(absolutePath)) {
    fail(`Missing required visual file: ${file}.`);
    return "";
  }

  return readFileSync(absolutePath, "utf8");
}

function fail(message) {
  failures.push(message);
}
