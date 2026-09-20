import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['v4-anonymous-redirect-contract.spec.mjs', 'v4-theme-assignment-contract.spec.mjs'],
  fullyParallel: true,
  workers: 3,
  retries: 0,
  reporter: 'list',
  use: { browserName: 'chromium', screenshot: 'off', trace: 'off', video: 'off' }
});
