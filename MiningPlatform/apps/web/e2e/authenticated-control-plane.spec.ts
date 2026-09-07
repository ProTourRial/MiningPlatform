/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { createHash, createHmac, randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';

test.skip(
  process.env.E2E_FULL_STACK !== 'true',
  'Requires a disposable API/database with AUTH_EXPOSE_TEST_TOKENS=true',
);
test.setTimeout(60_000);

function decodeBase32(value: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const character of value.replaceAll('=', '').toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error('Invalid base32 secret');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(secret: string, timestamp = Date.now()): string {
  const counter = Math.floor(timestamp / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', decodeBase32(secret)).update(buffer).digest();
  const offset = digest.at(-1)! & 0x0f;
  const value =
    (((digest[offset]! & 0x7f) << 24) |
      ((digest[offset + 1]! & 0xff) << 16) |
      ((digest[offset + 2]! & 0xff) << 8) |
      (digest[offset + 3]! & 0xff)) %
    1_000_000;
  return value.toString().padStart(6, '0');
}

function base58(value: Buffer): string {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let numeric = BigInt(`0x${value.toString('hex')}`);
  let encoded = '';
  while (numeric > 0n) {
    encoded = alphabet[Number(numeric % 58n)]! + encoded;
    numeric /= 58n;
  }
  for (const byte of value) {
    if (byte !== 0) break;
    encoded = `1${encoded}`;
  }
  return encoded;
}

function disposableMainnetAddress(): string {
  const payload = Buffer.concat([Buffer.from([0]), randomBytes(20)]);
  const checksum = createHash('sha256')
    .update(createHash('sha256').update(payload).digest())
    .digest()
    .subarray(0, 4);
  return base58(Buffer.concat([payload, checksum]));
}

test('registers, verifies, authenticates, provisions a worker, and exercises payout controls', async ({
  page,
}) => {
  const suffix = randomBytes(6).toString('hex');
  const email = `browser-${suffix}@example.test`;
  const password = `MiningPlatform-${suffix}-Password9`;
  const miningUsername = `browser_${suffix}`;

  await page.goto('/register');
  await page.getByLabel('Nama').fill('Browser E2E User');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Username mining').fill(miningUsername);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Buat akun' }).click();
  const verificationLink = page.getByRole('link', { name: 'Development: buka verifikasi email' });
  await expect(verificationLink).toBeVisible();
  await verificationLink.click();
  await page.getByRole('button', { name: 'Verifikasi' }).click();
  await expect(page.getByText('Email berhasil diverifikasi.')).toBeVisible();

  await page.getByRole('link', { name: 'Kembali ke login' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /Masuk ke workspace/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();

  await page.goto('/dashboard/workers');
  await page.getByLabel('Nama worker').fill(`cpu-${suffix}`);
  await page.getByLabel('Jenis hardware').selectOption('CPU');
  await page.getByRole('button', { name: /Tambah worker/i }).click();
  await expect(page.getByText('Kredensial siap digunakan')).toBeVisible();
  await expect(page.getByText(`cpu-${suffix}`, { exact: true })).toBeVisible();

  await page.goto('/dashboard/rewards');
  await expect(page.getByRole('heading', { name: 'Reward allocations' })).toBeVisible();
  await expect(page.getByText('Belum ada settlement reward untuk akun ini.')).toBeVisible();

  await page.goto('/dashboard/security');
  await page.getByRole('button', { name: 'Mulai setup' }).click();
  const otpUri = await page.locator('p.font-mono').filter({ hasText: 'otpauth://' }).textContent();
  if (!otpUri) throw new Error('TOTP enrollment URI was not rendered');
  const secret = new URL(otpUri).searchParams.get('secret');
  if (!secret) throw new Error('TOTP enrollment secret was not present');
  // Enroll with the previous valid counter so the current counter remains unused for step-up.
  await page.getByPlaceholder('Kode 6 digit').fill(totp(secret, Date.now() - 30_000));
  await page.getByRole('button', { name: 'Aktifkan 2FA' }).click();
  await expect(page.getByText('Simpan recovery code.')).toBeVisible();

  await page.goto('/dashboard/wallet');
  await expect(page.getByRole('heading', { name: 'Alamat payout' })).toBeVisible();
  await page.getByLabel('Label opsional').fill('Disposable E2E destination');
  await page.getByLabel('Alamat tujuan').fill(disposableMainnetAddress());
  await page.getByLabel('Password akun').fill(password);
  await page.getByLabel('Kode TOTP').fill(totp(secret));
  await page.getByRole('button', { name: 'Daftarkan alamat dengan step-up' }).click();
  await expect(page.getByText(/masuk masa cooldown/i)).toBeVisible();
  await expect(page.getByText('COOLDOWN', { exact: true })).toBeVisible();

  const autoWithdrawal = page.getByRole('switch').first();
  await autoWithdrawal.click();
  await expect(autoWithdrawal).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText(/environment ini/i).first()).toBeVisible();

  await expect(page.getByRole('button', { name: 'Ajukan payout' })).toBeDisabled();
  await expect(page.getByText(/environment request gate OFF/i)).toBeVisible();

  const logoutButton = page.getByRole('button', { name: 'Keluar dari session' });
  if (!(await logoutButton.isVisible())) {
    await page.getByRole('button', { name: 'Buka navigasi' }).click();
  }
  await logoutButton.click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
});
