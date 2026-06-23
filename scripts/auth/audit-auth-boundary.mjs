import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const scanRoots = ["apps/web"];
const ignoredFiles = new Set([normalizePath("scripts/auth/audit-auth-boundary.mjs")]);

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
  }
];

const failures = [];

for (const scanRoot of scanRoots) {
  const absoluteRoot = join(root, scanRoot);

  if (existsSync(absoluteRoot)) {
    scanDirectory(absoluteRoot);
  }
}

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
