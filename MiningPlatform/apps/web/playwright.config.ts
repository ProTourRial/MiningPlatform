/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const vercelBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const startLocalWeb = !process.env.E2E_BASE_URL && process.env.E2E_START_WEB !== 'false';

export default defineConfig({
  testDir: './e2e',
  outputDir: '../../.artifacts/playwright',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['line'], ['html', { outputFolder: '../../.artifacts/playwright-report', open: 'never' }]]
    : 'list',
  use: {
    baseURL,
    trace: vercelBypass ? 'off' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    extraHTTPHeaders: vercelBypass
      ? {
          'x-vercel-protection-bypass': vercelBypass,
          'x-vercel-set-bypass-cookie': 'true',
        }
      : undefined,
  },
  webServer: startLocalWeb
    ? {
        command: process.env.E2E_WEB_COMMAND ?? 'pnpm dev',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },
  ],
});
