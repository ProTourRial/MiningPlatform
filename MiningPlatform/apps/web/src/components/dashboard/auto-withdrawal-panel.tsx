'use client';

/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { useEffect, useState } from 'react';
import { apiRequest } from '@/services/api-client';

type Preference = {
  miningAccountId: string;
  username: string;
  asset: string;
  minimumPayout: string;
  autoWithdrawalEnabled: boolean;
  effective: boolean;
  blockers: string[];
};

const blockerLabel: Record<string, string> = {
  AUTO_PAYOUT_EXECUTOR_NOT_IMPLEMENTED: 'Scheduler auto payout belum diaktifkan pada rilis alpha.',
  GLOBAL_PAYOUT_GATE_DISABLED: 'Payout global masih dinonaktifkan oleh operator.',
  NO_ACTIVE_VERIFIED_PAYOUT_ADDRESS: 'Belum ada alamat payout aktif yang terverifikasi.',
};

export function AutoWithdrawalPanel() {
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [busyId, setBusyId] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    apiRequest<Preference[]>('/payouts/preferences')
      .then((value) => active && setPreferences(value))
      .catch(
        (reason) =>
          active && setError(reason instanceof Error ? reason.message : 'Pengaturan gagal dimuat'),
      );
    return () => {
      active = false;
    };
  }, []);

  async function toggle(preference: Preference) {
    setBusyId(preference.miningAccountId);
    setError(undefined);
    try {
      const updated = await apiRequest<Preference>(
        `/payouts/preferences/${preference.miningAccountId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ enabled: !preference.autoWithdrawalEnabled }),
        },
      );
      setPreferences((current) =>
        current.map((item) => (item.miningAccountId === updated.miningAccountId ? updated : item)),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Pengaturan gagal disimpan');
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <section className="dashboard-card rounded-3xl p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mono-font text-[9px] uppercase tracking-[0.18em] text-[#71899a]">
            User preference
          </p>
          <h2 className="mt-2 text-xl font-semibold">Auto withdrawal</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Default OFF. Pilihan ON hanya menyimpan preferensi; eksekusi tetap menunggu minimum
            payout, alamat terverifikasi, wallet sehat, dan gate operator.
          </p>
        </div>
      </div>

      {error && (
        <p className="mt-5 rounded-xl border border-red-300/20 bg-red-300/5 p-3 text-sm text-red-100">
          {error}
        </p>
      )}

      <div className="mt-6 grid gap-3">
        {preferences.map((preference) => (
          <article
            key={preference.miningAccountId}
            className="dashboard-inset grid gap-4 rounded-2xl p-5 sm:grid-cols-[1fr_auto] sm:items-center"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm">{preference.username}</span>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px]">
                  {preference.asset}
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] ${
                    preference.effective
                      ? 'border-emerald-300/20 text-emerald-100'
                      : 'border-amber-300/20 text-amber-100'
                  }`}
                >
                  {preference.effective ? 'READY' : 'GATED'}
                </span>
              </div>
              <p className="mt-2 text-xs text-[var(--muted)]">
                Minimum payout {preference.minimumPayout} {preference.asset}
              </p>
              {preference.blockers.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-amber-100/70">
                  {preference.blockers.map((blocker) => (
                    <li key={blocker}>• {blockerLabel[blocker] ?? blocker}</li>
                  ))}
                </ul>
              )}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={preference.autoWithdrawalEnabled}
              disabled={busyId === preference.miningAccountId}
              onClick={() => void toggle(preference)}
              className={`min-w-24 rounded-xl border px-4 py-3 text-sm font-semibold transition disabled:opacity-50 ${
                preference.autoWithdrawalEnabled
                  ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100'
                  : 'border-white/10 bg-black/20 text-[#9cafbd]'
              }`}
            >
              {busyId === preference.miningAccountId
                ? 'Menyimpan…'
                : preference.autoWithdrawalEnabled
                ? 'ON'
                : 'OFF'}
            </button>
          </article>
        ))}
        {!preferences.length && !error && (
          <p className="text-sm text-[var(--muted)]">Memuat pengaturan payout…</p>
        )}
      </div>
    </section>
  );
}
