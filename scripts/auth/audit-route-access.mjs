import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

const shellContracts = [
  {
    shell: "child",
    prefix: "/kind",
    routePath: "apps/web/app/(child)/kind",
    metadataFiles: ["layout.tsx"]
  },
  {
    shell: "parent",
    prefix: "/portaal",
    routePath: "apps/web/app/(portaal)/portaal",
    metadataFiles: ["layout.tsx"]
  },
  {
    shell: "instructor",
    prefix: "/instructor",
    routePath: "apps/web/app/(instructor)/instructor",
    metadataFiles: ["layout.tsx"]
  },
  {
    shell: "tenant_admin",
    prefix: "/admin",
    routePath: "apps/web/app/(tenant-admin)/admin",
    metadataFiles: ["layout.tsx"]
  },
  {
    shell: "platform_admin",
    prefix: "/platform",
    routePath: "apps/web/app/(platform-admin)/platform",
    metadataFiles: ["layout.tsx", "page.tsx"]
  }
];

const errors = [];
const accessSource = readProjectFile("apps/web/lib/auth/access.ts");
const guardSource = readProjectFile("apps/web/lib/auth/guard.ts");

for (const contract of shellContracts) {
  assertContains(accessSource, `shell: "${contract.shell}"`, `Missing shell "${contract.shell}" in privateShellAccess.`);
  assertContains(accessSource, `pathPrefix: "${contract.prefix}"`, `Missing path prefix "${contract.prefix}" in privateShellAccess.`);
  assertContains(guardSource, `"${contract.shell}"`, `Guard contract does not reference shell "${contract.shell}".`);

  const absoluteRoutePath = join(root, contract.routePath);

  if (!existsSync(absoluteRoutePath) || !statSync(absoluteRoutePath).isDirectory()) {
    errors.push(`Missing private route directory: ${contract.routePath}`);
    continue;
  }

  const metadataFile = contract.metadataFiles.find((fileName) => {
    const absolutePath = join(absoluteRoutePath, fileName);

    if (!existsSync(absolutePath)) {
      return false;
    }

    const source = readFileSync(absolutePath, "utf8");

    return source.includes("privateRouteMetadata") && source.includes("export const metadata");
  });

  if (!metadataFile) {
    errors.push(`Private shell "${contract.shell}" must export privateRouteMetadata from one of: ${contract.metadataFiles.join(", ")}`);
  }

  const layoutPath = join(absoluteRoutePath, "layout.tsx");

  if (!existsSync(layoutPath)) {
    errors.push(`Private shell "${contract.shell}" must use a guarded layout.tsx.`);
    continue;
  }

  const layoutSource = readFileSync(layoutPath, "utf8");

  if (!layoutSource.includes("requirePrivateShellContext")) {
    errors.push(`Private shell "${contract.shell}" layout must call requirePrivateShellContext().`);
  }
}

const prefixes = [...accessSource.matchAll(/pathPrefix:\s*"([^"]+)"/g)].map((match) => match[1]);
const duplicatePrefixes = prefixes.filter((prefix, index) => prefixes.indexOf(prefix) !== index);

for (const prefix of duplicatePrefixes) {
  errors.push(`Duplicate private shell path prefix: ${prefix}`);
}

for (const prefix of prefixes) {
  const overlappingPrefix = prefixes.find((candidate) => candidate !== prefix && candidate.startsWith(`${prefix}/`));

  if (overlappingPrefix) {
    errors.push(`Overlapping private shell path prefixes: ${prefix} and ${overlappingPrefix}`);
  }
}

if (errors.length > 0) {
  console.error("Route access audit failed:");

  for (const error of errors) {
    console.error(`- ${error}`);
  }

  process.exit(1);
}

console.log(`Route access audit passed for ${shellContracts.length} private shells.`);

function readProjectFile(path) {
  const absolutePath = join(root, path);

  if (!existsSync(absolutePath)) {
    errors.push(`Missing required file: ${path}`);
    return "";
  }

  return readFileSync(absolutePath, "utf8");
}

function assertContains(source, needle, message) {
  if (!source.includes(needle)) {
    errors.push(message);
  }
}
