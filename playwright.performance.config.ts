import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/performance.e2e.ts',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  timeout: 240_000,
  use: {
    baseURL: 'http://127.0.0.1:4284',
    ...devices['Pixel 5'],
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'mobile-chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'node ./node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4284',
    url: 'http://127.0.0.1:4284',
    reuseExistingServer: false,
  },
});
