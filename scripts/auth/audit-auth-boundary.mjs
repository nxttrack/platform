import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const scanRoots = ["apps/web"];
const ignoredFiles = new Set([normalizePath("scripts/auth/audit-auth-boundary.mjs"), normalizePath("apps/web/lib/http/trusted-request-origin.ts")]);

const forbiddenPatterns = [
  {
    pattern: /\bauth\.getSession\s*\(/,
    message: "server-side auth must not authorize from getSession(); use getUser()/getClaims() and database memberships"
  },
  {
    pattern: /\b(?:raw_user_meta_data|user_metadata)\b/,
    message: "authorization must not depend on editable user metadata"
  },
  {
    pattern: /\bNEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|SERVICE_ROLE|DATABASE_URL|DB_PASSWORD)[A-Z0-9_]*\b/,
    message: "secret database or service credentials must never be exposed through NEXT_PUBLIC env vars"
  },
  {
    pattern: /\bSUPABASE_SERVICE_ROLE_KEY\b|\bservice_role_key\b/i,
    message: "service-role credentials must not be used in the web app boundary"
  },
  {
    pattern: /["']x-forwarded-host["']/,
    message: "forwarded hosts must only be read through getTrustedRequestOrigin()"
  }
];

const failures = [];

for (const scanRoot of scanRoots) {
  const absoluteRoot = join(root, scanRoot);

  if (existsSync(absoluteRoot)) {
    scanDirectory(absoluteRoot);
  }
}

auditEmailSecretPreservation();

if (failures.length > 0) {
  console.error("Auth boundary audit failed:");

  for (const failure of failures) {
    console.error(`- ${failure}`);
  }

  process.exit(1);
}

console.log(`Auth boundary audit passed for ${scanRoots.join(", ")}.`);

function scanDirectory(directory) {
  for (const entry of readdirSync(directory)) {
    const absolutePath = join(directory, entry);
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      if (entry !== "node_modules" && entry !== ".next") {
        scanDirectory(absolutePath);
      }

      continue;
    }

    if (!/\.(?:ts|tsx|js|jsx|mjs)$/.test(entry)) {
      continue;
    }

    const projectPath = normalizePath(relative(root, absolutePath));

    if (ignoredFiles.has(projectPath)) {
      continue;
    }

    const source = readFileSync(absolutePath, "utf8");

    for (const { pattern, message } of forbiddenPatterns) {
      if (pattern.test(source)) {
        failures.push(`${projectPath}: ${message}.`);
      }
    }
  }
}

function normalizePath(value) {
  return value.replaceAll("\\", "/");
}

function auditEmailSecretPreservation() {
  const actionsPath = join(root, "apps/web/lib/email/actions.ts");
  const settingsPath = join(root, "apps/web/lib/email/platform-settings.ts");
  const transactionalPath = join(root, "apps/web/lib/email/transactional.ts");
  const actions = readFileSync(actionsPath, "utf8");
  const settings = readFileSync(settingsPath, "utf8");
  const transactional = readFileSync(transactionalPath, "utf8");

  requireContract(actions, 'formData.get("replaceSendGridApiKey") === "on"', "SendGrid replacement must require explicit user intent");
  requireContract(actions, 'formData.get("replaceSmtpPassword") === "on"', "SMTP password replacement must require explicit user intent");
  requireContract(actions, "replaceSendGridApiKey ? submittedSendGridApiKey : undefined", "an unconfirmed SendGrid field must resolve to an omitted secret update");
  requireContract(actions, "replaceSmtpPassword ? submittedSmtpPassword : undefined", "an unconfirmed SMTP password must resolve to an omitted secret update");
  requireContract(settings, "if (input.sendGridApiKey !== undefined)", "SendGrid storage must only change for replace or clear requests");
  requireContract(settings, "if (input.smtpPassword !== undefined)", "SMTP password storage must only change for replace or clear requests");
  requireContract(settings, '.update(values).eq("id", SETTINGS_ID)', "email settings must preserve omitted database columns during updates");
  requireContract(transactional, "if (isReservedTestRecipient(input.to))", "reserved .test recipients must be intercepted before provider delivery");

  if (actions.includes("getExistingPlatformEmailSecrets")) {
    failures.push("apps/web/lib/email/actions.ts: unchanged email secrets must not be decrypted and rewritten during a settings save.");
  }
}

function requireContract(source, expected, message) {
  if (!source.includes(expected)) {
    failures.push(`email settings secret contract: ${message}.`);
  }
}
