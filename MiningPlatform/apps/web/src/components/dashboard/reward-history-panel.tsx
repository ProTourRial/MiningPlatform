'use client';

/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Coins, RefreshCw, Scale } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '@/services/api-client';

type RewardAllocation = {
  id: string;
  grossAtomic: string;
  upstreamFeeAtomic: string;
  networkFeeAtomic: string;
  platformFeeAtomic: string;
  netAtomic: string;
  feeBasisPoints: string;
  referralCommissionAtomic: string;
  platformRetainedAtomic: string;
  strategyVersion: string;
  journalEntryId: string | null;
  createdAt: string;
  rewardPeriod: {
    id: string;
    status: string;
    reconciliationStatus: string;
    periodStart: string;
    periodEnd: string;
    asset: { symbol: string; decimals: number };
    upstreamPool: { poolKey: string; name: string } | null;
    sourceReference: string | null;
  };
};

type RewardResponse = { allocations: RewardAllocation[]; payoutStatus: string };

function formatAtomic(value: string, decimals: number): string {
  const padded = value.padStart(decimals + 1, '0');
  const integer = padded.slice(0, -decimals) || '0';
  const fraction = decimals ? padded.slice(-decimals).replace(/0+$/, '') : '';
  return `${integer}${fraction ? `.${fraction}` : ''}`;
}

export function RewardHistoryPanel() {
  const [response, setResponse] = useState<RewardResponse>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setError(undefined);
    try {
      setResponse(await apiRequest<RewardResponse>('/rewards'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Alokasi reward gagal dimuat');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const totalsByAsset = useMemo(() => {
    const totals = new Map<string, { symbol: string; decimals: number; atomic: bigint }>();
    for (const allocation of response?.allocations ?? []) {
      const { symbol, decimals } = allocation.rewardPeriod.asset;
      const key = `${symbol}:${decimals}`;
      const current = totals.get(key);
      totals.set(key, {
        symbol,
        decimals,
        atomic: (current?.atomic ?? 0n) + BigInt(allocation.netAtomic),
      });
    }
    return [...totals.values()];
  }, [response]);

  return (
    <section className="dashboard-card rounded-3xl p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mono-font text-[9px] uppercase tracking-[0.18em] text-[#71899a]">
            Posted financial truth
          </p>
          <h2 className="mt-2 text-xl font-semibold">Reward allocations</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            Hanya settlement yang berasal dari API dan memiliki bukti period, policy fee, serta
            journal yang ditampilkan di sini. Angka kosong tidak diganti data demo.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-5 rounded-xl border border-red-300/20 bg-red-300/5 p-3 text-sm text-red-100"
        >
          {error}
        </p>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="dashboard-inset rounded-2xl p-4">
          <Coins size={17} className="text-[var(--accent)]" />
          <div className="mt-3 space-y-1 text-xl font-bold">
            {totalsByAsset.length > 0
              ? totalsByAsset.map((total) => (
                  <p key={`${total.symbol}:${total.decimals}`}>
                    {formatAtomic(total.atomic.toString(), total.decimals)} {total.symbol}
                  </p>
                ))
              : '—'}
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">Total net per aset</p>
        </div>
        <div className="dashboard-inset rounded-2xl p-4">
          <Scale size={17} className="text-cyan-100" />
          <p className="mt-3 text-xl font-bold">{response?.allocations.length ?? 0}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">Allocation records</p>
        </div>
        <div className="dashboard-inset rounded-2xl p-4">
          <p className="mono-font text-[9px] uppercase tracking-[0.15em] text-[#71899a]">
            Payout gate
          </p>
          <p className="mt-3 text-xl font-bold text-amber-100">{response?.payoutStatus ?? '—'}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">Bukan spendable tanpa payout controls</p>
        </div>
      </div>

      <div className="mt-7 grid gap-3">
        {response?.allocations.map((allocation) => {
          const { asset } = allocation.rewardPeriod;
          return (
            <article key={allocation.id} className="dashboard-inset rounded-2xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px]">
                      {allocation.rewardPeriod.status}
                    </span>
                    <span className="rounded-full border border-emerald-300/20 px-2 py-0.5 text-[10px] text-emerald-100">
                      {allocation.rewardPeriod.reconciliationStatus}
                    </span>
                  </div>
                  <p className="mt-3 text-lg font-semibold">
                    {formatAtomic(allocation.netAtomic, asset.decimals)} {asset.symbol} net
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {new Date(allocation.rewardPeriod.periodStart).toLocaleString('id-ID')} –{' '}
                    {new Date(allocation.rewardPeriod.periodEnd).toLocaleString('id-ID')}
                  </p>
                </div>
                <div className="text-right text-xs text-[var(--muted)]">
                  <p>Fee {allocation.feeBasisPoints} bps</p>
                  <p className="mt-1">Strategy {allocation.strategyVersion}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-2 border-t border-white/8 pt-4 text-[11px] text-[var(--muted)] sm:grid-cols-4">
                <span>Gross {formatAtomic(allocation.grossAtomic, asset.decimals)}</span>
                <span>Platform {formatAtomic(allocation.platformFeeAtomic, asset.decimals)}</span>
                <span>
                  Referral {formatAtomic(allocation.referralCommissionAtomic, asset.decimals)}
                </span>
                <span>Journal {allocation.journalEntryId ? 'POSTED' : 'MISSING'}</span>
              </div>
            </article>
          );
        })}
        {!loading && response?.allocations.length === 0 && (
          <p className="rounded-2xl border border-dashed border-white/10 p-5 text-sm text-[var(--muted)]">
            Belum ada settlement reward untuk akun ini.
          </p>
        )}
      </div>
    </section>
  );
}
