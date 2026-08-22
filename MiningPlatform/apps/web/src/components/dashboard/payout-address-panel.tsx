'use client';

/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '@/services/api-client';

type PayoutRoute = {
  id: string;
  routeKey: string;
  version: number;
  status: 'ADDRESS_REGISTRATION' | 'PILOT' | 'ACTIVE';
  minimumPayoutAtomic: string;
  addressCooldownSeconds: number;
  requiredConfirmations: number;
  manualApprovalRequired: boolean;
  fundsEnabled: boolean;
  registrationOnly: boolean;
  assetNetwork: {
    networkKey: string;
    displayName: string;
    isTestnet: boolean;
    asset: { symbol: string; decimals: number };
  };
};

type PayoutAddress = {
  id: string;
  label: string | null;
  status: 'COOLDOWN' | 'ACTIVE' | 'DISABLED';
  verified: boolean;
  active: boolean;
  cooldownUntil: string;
  activatedAt: string | null;
  addressDisplay: string;
  addressFingerprint: string;
  payoutCapable: boolean;
  asset: { symbol: string };
  assetNetwork: { networkKey: string; displayName: string; isTestnet: boolean };
  payoutRoute: { id: string; status: string; version: number };
};

type StepUpResponse = { token: string; expiresAt: string; singleUse: true };

async function fetchPayoutControlData(): Promise<[PayoutRoute[], PayoutAddress[]]> {
  return Promise.all([
    apiRequest<PayoutRoute[]>('/payouts/routes'),
    apiRequest<PayoutAddress[]>('/payouts/addresses'),
  ]);
}

function atomicAmount(value: string, decimals: number): string {
  const padded = value.padStart(decimals + 1, '0');
  const integer = padded.slice(0, -decimals) || '0';
  const fraction = decimals ? padded.slice(-decimals).replace(/0+$/, '') : '';
  return fraction ? `${integer}.${fraction}` : integer;
}

export function PayoutAddressPanel() {
  const [routes, setRoutes] = useState<PayoutRoute[]>([]);
  const [addresses, setAddresses] = useState<PayoutAddress[]>([]);
  const [routeId, setRouteId] = useState('');
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [clockMs, setClockMs] = useState(0);

  async function load() {
    const [routeValues, addressValues] = await fetchPayoutControlData();
    setRoutes(routeValues);
    setAddresses(addressValues);
    setRouteId((current) => current || routeValues[0]?.id || '');
  }

  useEffect(() => {
    let active = true;
    void fetchPayoutControlData()
      .then(([routeValues, addressValues]) => {
        if (!active) return;
        setRoutes(routeValues);
        setAddresses(addressValues);
        setRouteId(routeValues[0]?.id || '');
      })
      .catch((reason) => {
        if (active)
          setError(reason instanceof Error ? reason.message : 'Alamat payout gagal dimuat');
      });
    const timer = window.setInterval(() => setClockMs(Date.now()), 1_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const selectedRoute = useMemo(
    () => routes.find((route) => route.id === routeId),
    [routeId, routes],
  );

  async function stepUp(): Promise<string> {
    if (!password || !/^\d{6}$/.test(totpCode)) {
      throw new Error('Masukkan password dan kode TOTP 6 digit untuk perubahan sensitif');
    }
    const result = await apiRequest<StepUpResponse>('/auth/step-up', {
      method: 'POST',
      body: JSON.stringify({ scope: 'PAYOUT_ADDRESS_WRITE', password, code: totpCode }),
    });
    return result.token;
  }

  function clearSensitiveFields() {
    setPassword('');
    setTotpCode('');
  }

  async function register() {
    setBusy('register');
    setError(undefined);
    setNotice(undefined);
    try {
      const token = await stepUp();
      await apiRequest<PayoutAddress>('/payouts/addresses', {
        method: 'POST',
        headers: { 'x-step-up-token': token },
        body: JSON.stringify({ payoutRouteId: routeId, address, label: label || undefined }),
      });
      clearSensitiveFields();
      setAddress('');
      setLabel('');
      setNotice(
        'Alamat lolos checksum jaringan dan masuk masa cooldown. Dana nyata tetap nonaktif.',
      );
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Alamat payout gagal didaftarkan');
    } finally {
      setBusy(undefined);
    }
  }

  async function transition(target: PayoutAddress, action: 'activate' | 'disable') {
    setBusy(`${action}:${target.id}`);
    setError(undefined);
    setNotice(undefined);
    try {
      const token = await stepUp();
      await apiRequest<PayoutAddress>(`/payouts/addresses/${target.id}/${action}`, {
        method: 'POST',
        headers: { 'x-step-up-token': token },
        body: '{}',
      });
      clearSensitiveFields();
      setNotice(
        action === 'activate'
          ? 'Alamat diaktifkan sebagai tujuan terpilih. Payout tetap terblokir oleh gate global.'
          : 'Alamat dinonaktifkan dan tidak dapat dipakai kembali.',
      );
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Perubahan alamat payout gagal');
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <section className="dashboard-card rounded-3xl p-5 sm:p-7">
      <div>
        <p className="mono-font text-[9px] uppercase tracking-[0.18em] text-[#71899a]">
          P0.4 address control
        </p>
        <h2 className="mt-2 text-xl font-semibold">Alamat payout</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
          Pendaftaran memeriksa checksum dan jaringan, membutuhkan password + TOTP, memakai token
          step-up sekali pakai, lalu menjalani cooldown. Verifikasi ini memvalidasi format tujuan,
          bukan bukti kepemilikan private key.
        </p>
      </div>

      {(error || notice) && (
        <p
          role="status"
          className={`mt-5 rounded-xl border p-3 text-sm ${
            error
              ? 'border-red-300/20 bg-red-300/5 text-red-100'
              : 'border-emerald-300/20 bg-emerald-300/5 text-emerald-100'
          }`}
        >
          {error ?? notice}
        </p>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <label className="grid gap-2 text-sm">
          <span className="text-[var(--muted)]">Jaringan dan rute</span>
          <select
            value={routeId}
            onChange={(event) => setRouteId(event.target.value)}
            className="rounded-xl border border-white/10 bg-black/25 px-4 py-3"
          >
            {routes.map((route) => (
              <option key={route.id} value={route.id}>
                {route.assetNetwork.asset.symbol} · {route.assetNetwork.displayName} ·{' '}
                {route.status}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm">
          <span className="text-[var(--muted)]">Label opsional</span>
          <input
            value={label}
            maxLength={80}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Wallet utama"
            className="rounded-xl border border-white/10 bg-black/25 px-4 py-3"
          />
        </label>
        <label className="grid gap-2 text-sm lg:col-span-2">
          <span className="text-[var(--muted)]">Alamat tujuan</span>
          <input
            value={address}
            maxLength={128}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setAddress(event.target.value)}
            placeholder="bc1…"
            className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 font-mono"
          />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="text-[var(--muted)]">Password akun</span>
          <input
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-xl border border-white/10 bg-black/25 px-4 py-3"
          />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="text-[var(--muted)]">Kode TOTP</span>
          <input
            value={totpCode}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, ''))}
            className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 font-mono"
          />
        </label>
      </div>

      {selectedRoute && (
        <p className="mt-4 text-xs leading-5 text-amber-100/70">
          Minimum{' '}
          {atomicAmount(
            selectedRoute.minimumPayoutAtomic,
            selectedRoute.assetNetwork.asset.decimals,
          )}{' '}
          {selectedRoute.assetNetwork.asset.symbol}; cooldown{' '}
          {selectedRoute.addressCooldownSeconds / 3600} jam;
          {selectedRoute.registrationOnly
            ? ' rute hanya menerima registrasi alamat.'
            : ' rute pilot/aktif.'}
        </p>
      )}

      <button
        type="button"
        disabled={!routeId || !address || busy === 'register'}
        onClick={() => void register()}
        className="mt-5 rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-5 py-3 text-sm font-semibold text-cyan-100 disabled:opacity-50"
      >
        {busy === 'register' ? 'Memvalidasi…' : 'Daftarkan alamat dengan step-up'}
      </button>

      <div className="mt-7 grid gap-3">
        {addresses.map((item) => {
          const cooldownElapsed = clockMs > 0 && new Date(item.cooldownUntil).getTime() <= clockMs;
          return (
            <article key={item.id} className="dashboard-inset rounded-2xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm">{item.addressDisplay}</span>
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px]">
                      {item.status}
                    </span>
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px]">
                      {item.asset.symbol} · {item.assetNetwork.displayName}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    {item.label ?? 'Tanpa label'} · fingerprint {item.addressFingerprint}
                  </p>
                  {item.status === 'COOLDOWN' && (
                    <p className="mt-2 text-xs text-amber-100/70">
                      Cooldown sampai {new Date(item.cooldownUntil).toLocaleString('id-ID')}.
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {item.status === 'COOLDOWN' && (
                    <button
                      type="button"
                      disabled={!cooldownElapsed || Boolean(busy)}
                      onClick={() => void transition(item, 'activate')}
                      className="rounded-lg border border-emerald-300/20 px-3 py-2 text-xs text-emerald-100 disabled:opacity-40"
                    >
                      Aktifkan
                    </button>
                  )}
                  {item.status !== 'DISABLED' && (
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => void transition(item, 'disable')}
                      className="rounded-lg border border-red-300/20 px-3 py-2 text-xs text-red-100 disabled:opacity-40"
                    >
                      Nonaktifkan
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
