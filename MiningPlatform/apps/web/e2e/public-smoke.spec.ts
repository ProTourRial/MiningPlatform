/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { expect, test } from '@playwright/test';

const publicRoutes = ['/', '/transparency', '/login', '/register'] as const;

for (const route of publicRoutes) {
  test(`${route} renders without a deployment 404`, async ({ page }) => {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response, `No response received for ${route}`).not.toBeNull();
    expect(response?.status(), `${route} returned an HTTP error`).toBeLessThan(400);
    await expect(page.locator('body')).not.toContainText('404: NOT_FOUND');
    await expect(page.locator('body')).not.toContainText('No framework detected');
    await expect(page.locator('main').first()).toBeVisible();

    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(horizontalOverflow, `${route} has horizontal overflow`).toBe(false);
  });
}

test('authentication forms expose the real API contract fields', async ({ page }) => {
  await page.goto('/register');
  await expect(page.getByLabel('Nama')).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Username mining')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();

  await page.goto('/login');
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByRole('button', { name: /Masuk ke workspace/i })).toBeEnabled();
  await expect(page.getByRole('button', { name: /Lanjutkan dengan Google/i })).toHaveCount(0);
});

test('protected dashboard redirects to login before rendering operational data', async ({
  page,
}) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
});
