import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests drive a real browser against the real backend and database (docker compose or CI services),
 * with the app started with the "dev,loadtest" profiles so tests can create events and guests through the API.
 * Each test makes its own event, so tests can run side by side.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: process.env.WEB_URL ?? 'http://localhost:5173', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // The screens used at the drop are also run on a phone.
    { name: 'mobile', grep: /@mobile/, use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.WEB_URL
    ? undefined
    : { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 60_000 },
})
