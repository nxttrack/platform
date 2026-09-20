import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "../../apps/web/tests/e2e",
  testMatch: "communication-login-diagnostic-contract.spec.ts",
  fullyParallel: true,
  workers: 4,
  retries: 0,
  reporter: "list",
  use: { browserName: "chromium", screenshot: "off", trace: "off", video: "off" }
});
