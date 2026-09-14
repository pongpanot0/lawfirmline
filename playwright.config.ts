import { defineConfig, devices } from '@playwright/test';

const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:3005';

export default defineConfig({
  testDir: './e2e/tests',
  timeout: 90_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'e2e/report', open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: WEB,
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'practice-setup', testMatch: /practice-setup\.spec\.ts/ },
    { name: 'court-offline', testMatch: /court-offline\.spec\.ts/ },
    { name: 'portal-workroom', testMatch: /portal-workroom\.spec\.ts/ },
    { name: 'action-deadlines', testMatch: /action-deadlines\.spec\.ts/ },
    { name: 'court-day', testMatch: /court-day\.spec\.ts/ },
    { name: 'journeys', testMatch: /journeys\.spec\.ts/ },
    { name: 'workspace', testMatch: /workspace\.spec\.ts/, dependencies: ['setup'], use: { storageState: 'e2e/.auth/admin.json' } },
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'guide',
      testMatch: /guide\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: 'e2e/.auth/admin.json' },
    },
    {
      name: 'validation',
      testMatch: /validation\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: 'e2e/.auth/admin.json' },
    },
    {
      name: 'pii',
      testMatch: /pii\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: 'e2e/.auth/admin.json' },
    },
    {
      name: 'line-bot',
      testMatch: /line-bot-case\.spec\.ts/,
    },
  ],
});
