#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const port = process.env.PORT || "3000";
const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const standaloneServer = join(appDir, ".next", "standalone", "apps", "web", "server.js");

const child = existsSync(standaloneServer)
  ? startStandaloneServer()
  : spawn("next", ["start", "-H", "0.0.0.0", "-p", port], {
      stdio: "inherit",
      shell: true
    });

function startStandaloneServer() {
  const standaloneAppDir = dirname(standaloneServer);
  const requiredAssetPaths = [join(standaloneAppDir, ".next", "static"), join(standaloneAppDir, "public")];
  const missingAssetPaths = requiredAssetPaths.filter((assetPath) => !existsSync(assetPath));

  if (missingAssetPaths.length > 0) {
    console.error("Standalone Next.js assets are missing. Run scripts/deploy/prepare-standalone-assets.mjs after next build.");
    missingAssetPaths.forEach((assetPath) => console.error(`Missing: ${assetPath}`));
    process.exit(1);
  }

  return spawn(process.execPath, [standaloneServer], {
      cwd: dirname(standaloneServer),
      env: { ...process.env, HOSTNAME: "0.0.0.0", PORT: port },
      stdio: "inherit",
      shell: false
    });
}

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
