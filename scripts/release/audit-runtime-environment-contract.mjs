#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const deploy = read(".github/workflows/deploy.yml");
const foundation = read(".github/workflows/production-foundation-audit.yml");
const example = read(".env.example");
const documentation = read("docs/REQUIRED_ENVIRONMENT_VARIABLES.md");
const failures = [];

const runtimeVariables = [
  {
    name: "MAINTENANCE_NO_WRITE",
    deploySource: "MAINTENANCE_NO_WRITE:",
    writeLine: "printf 'MAINTENANCE_NO_WRITE=%s\\n' \"$MAINTENANCE_NO_WRITE\""
  },
  {
    name: "EMAIL_SENDING_ENABLED",
    deploySource: "EMAIL_SENDING_ENABLED:",
    writeLine: "printf 'EMAIL_SENDING_ENABLED=%s\\n' \"$EMAIL_SENDING_ENABLED\""
  },
  {
    name: "NEWSLETTER_DELIVERY_ENABLED",
    deploySource: "NEWSLETTER_DELIVERY_ENABLED:",
    writeLine: "printf 'NEWSLETTER_DELIVERY_ENABLED=%s\\n' \"$NEWSLETTER_DELIVERY_ENABLED\""
  },
  {
    name: "INTERNAL_JOBS_ENABLED",
    deploySource: "INTERNAL_JOBS_ENABLED:",
    writeLine: "printf 'INTERNAL_JOBS_ENABLED=%s\\n' \"$INTERNAL_JOBS_ENABLED\""
  },
  {
    name: "NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY",
    deploySource: "NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY: ${{ vars.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY }}",
    writeLine: "printf 'NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY=%s\\n' \"$NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY\""
  },
  {
    name: "WEB_PUSH_VAPID_PRIVATE_KEY",
    deploySource: "WEB_PUSH_VAPID_PRIVATE_KEY: ${{ secrets.WEB_PUSH_VAPID_PRIVATE_KEY }}",
    writeLine: "printf 'WEB_PUSH_VAPID_PRIVATE_KEY=%s\\n' \"$WEB_PUSH_VAPID_PRIVATE_KEY\""
  },
  {
    name: "WEB_PUSH_VAPID_SUBJECT",
    deploySource: "WEB_PUSH_VAPID_SUBJECT: ${{ vars.WEB_PUSH_VAPID_SUBJECT }}",
    writeLine: "printf 'WEB_PUSH_VAPID_SUBJECT=%s\\n' \"$WEB_PUSH_VAPID_SUBJECT\""
  }
];

for (const contract of runtimeVariables) {
  includes(deploy, contract.deploySource, `deploy job maps ${contract.name}`);
  includes(deploy, contract.writeLine, `deploy job writes ${contract.name} to the shared runtime environment`);
  includes(example, `${contract.name}=`, `.env.example documents ${contract.name}`);
  includes(documentation, `\`${contract.name}\``, `required environment documentation covers ${contract.name}`);
}

for (const name of [
  "MAINTENANCE_NO_WRITE",
  "EMAIL_SENDING_ENABLED",
  "NEWSLETTER_DELIVERY_ENABLED",
  "INTERNAL_JOBS_ENABLED",
  "NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY",
  "WEB_PUSH_VAPID_PRIVATE_KEY",
  "WEB_PUSH_VAPID_SUBJECT",
  "UPLOAD_MALWARE_SCAN_MODE",
  "CLAMAV_SOCKET_PATH"
]) {
  includes(foundation, `${name}:`, `production foundation receives ${name}`);
}

if (failures.length) {
  console.error("[runtime-env:audit] Failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`[runtime-env:audit] PASS ${runtimeVariables.length} deploy mappings, shared runtime writes and production audit inputs verified.`);

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function includes(content, expected, message) {
  if (!content.includes(expected)) failures.push(message);
}
