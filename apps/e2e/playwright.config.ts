import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.WEB_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  /* Run the app before tests (assumes demo is already running) */
  webServer: process.env.CI
    ? undefined
    : {
        command: 'pnpm run demo:start',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 120000,
        cwd: '../../',
      },
});
