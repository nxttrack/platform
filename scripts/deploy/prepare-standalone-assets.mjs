import { cpSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const webDir = join(root, "apps", "web");
const standaloneWebDir = join(webDir, ".next", "standalone", "apps", "web");
const standaloneServer = join(standaloneWebDir, "server.js");
const staticSource = join(webDir, ".next", "static");
const staticTarget = join(standaloneWebDir, ".next", "static");
const publicSource = join(webDir, "public");
const publicTarget = join(standaloneWebDir, "public");

if (!existsSync(standaloneServer)) {
  throw new Error(`Standalone server not found at ${standaloneServer}. Run pnpm build first.`);
}

if (!existsSync(staticSource)) {
  throw new Error(`Next static assets not found at ${staticSource}. Build did not produce CSS/JS assets.`);
}

copyDirectory(staticSource, staticTarget);

if (existsSync(publicSource)) {
  copyDirectory(publicSource, publicTarget);
}

console.log(`Prepared standalone static assets in ${standaloneWebDir}`);

function copyDirectory(source, target) {
  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });
}
