#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const port = process.env.PORT || "3000";
const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const standaloneServer = join(appDir, ".next", "standalone", "apps", "web", "server.js");

const child = existsSync(standaloneServer)
  ? spawn(process.execPath, [standaloneServer], {
      cwd: dirname(standaloneServer),
      env: { ...process.env, HOSTNAME: "0.0.0.0", PORT: port },
      stdio: "inherit",
      shell: false
    })
  : spawn("next", ["start", "-H", "0.0.0.0", "-p", port], {
      stdio: "inherit",
      shell: true
    });

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
