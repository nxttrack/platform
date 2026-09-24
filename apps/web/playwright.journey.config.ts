import { defineConfig, devices } from "@playwright/test";

const port = Number.parseInt(process.env.PLAYWRIGHT_PORT ?? "3107", 10);
const baseURL = `http://localhost:${port}`;
const useDevServer = process.env.PLAYWRIGHT_DEV_SERVER === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "journey-*.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: [["list"]],
  timeout: 180_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    { name: "journey-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "journey-firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "journey-webkit", use: { ...devices["Desktop Safari"] } }
  ],
  webServer: {
    // Run Next directly from the workspace build. The production start wrapper
    // prefers the standalone bundle, whose static assets are copied by the
    // container/deploy workflow rather than by a plain local `next build`.
    command: useDevServer
      ? `pnpm exec next dev -H 0.0.0.0 -p ${port}`
      : "pnpm exec next start -H 0.0.0.0",
    env: { ...process.env, APP_ENV: "test", PORT: String(port) },
    reuseExistingServer: false,
    timeout: 120_000,
    url: baseURL
  }
});
