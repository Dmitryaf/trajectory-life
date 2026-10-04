import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);
const mobileWebKitTests = [
  '**/daily-entry.e2e.ts',
  '**/first-use-recovery.e2e.ts',
  '**/journal-entry.e2e.ts',
  '**/pwa-installation.e2e.ts',
  '**/storage-protection.e2e.ts',
];

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  testIgnore: '**/performance.e2e.ts',
  globalSetup: './e2e/global-setup.ts',
  globalTimeout: isCI ? 10 * 60_000 : undefined,
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 1 : undefined,
  maxFailures: isCI ? 3 : 0,
  reporter: isCI ? [['github'], ['blob'], ['./scripts/ci/browser-reporter.mjs']] : 'list',
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}-{projectName}{ext}',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: isCI ? 'retain-on-failure' : 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['clipboard-read', 'clipboard-write'],
      },
    },
    {
      name: 'mobile-webkit',
      testMatch: [...mobileWebKitTests, '**/telemetry-consent.e2e.ts'],
      use: { ...devices['iPhone 13'] },
    },
    {
      name: 'webkit',
      testIgnore: ['**/performance.e2e.ts', '**/today-visual.e2e.ts', '**/interface-visual.e2e.ts', ...mobileWebKitTests],
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
