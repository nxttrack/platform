import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL?.replace(/\/+$/, "") || "http://127.0.0.1:3000";

if (process.env.E2E_REQUIRE_BASE_URL === "true" && !process.env.E2E_BASE_URL) {
  throw new Error("E2E_BASE_URL is required when E2E_REQUIRE_BASE_URL=true.");
}

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: {
    timeout: 10_000
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] }
    }
  ]
});
