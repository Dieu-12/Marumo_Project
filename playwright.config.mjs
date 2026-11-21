import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'list',
  use: { browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: [
    { command: 'npm --prefix marumo_web run dev -- --host 127.0.0.1 --strictPort', url: 'http://127.0.0.1:5175', reuseExistingServer: false },
    { command: 'npm --prefix marumo_admin run dev -- --host 127.0.0.1 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: false },
  ],
});
