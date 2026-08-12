/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

'use client';

import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BellRing,
  CheckCircle2,
  CircleOff,
  Cpu,
  Gauge,
  RadioTower,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import type { HashrateUpdatedPayload } from '@mining/shared';
import { ApiRequestError, apiRequest } from '@/services/api-client';

const configuredSocketUrl = process.env.NEXT_PUBLIC_SOCKET_URL?.replace(/\/$/, '');
const socketBaseUrl = configuredSocketUrl ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');
const socketNamespaceUrl = `${socketBaseUrl}/mining`;

interface DashboardOverview {
  workers: { total: number; byStatus: Record<string, number> };
  shares: { accepted: number; rejected: number; byStatus: Record<string, number> };
  hashrate5m: string;
  unreadNotifications: number;
  workerSnapshots: Array<{
    workerId: string;
    hashrate: string;
    acceptedShares?: number;
    rejectedShares?: number;
    recordedAt?: string;
  }>;
  generatedAt: string;
  accounting: { enabled: boolean; reason: string };
}

function formatHashrate(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 H/s';
  const units = ['H/s', 'KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s', 'EH/s'];
  let scaled = value;
  let unit = 0;
  while (scaled >= 1_000 && unit < units.length - 1) {
    scaled /= 1_000;
    unit += 1;
  }
  return `${scaled.toFixed(scaled >= 100 ? 0 : 2)} ${units[unit]}`;
}

function formatTimestamp(value?: string) {
  if (!value) return 'Menunggu snapshot';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value));
}

export function RealtimeMiningPanel() {
  const router = useRouter();
  const [overview, setOverview] = useState<DashboardOverview>();
  const [workerHashrates, setWorkerHashrates] = useState<Record<string, number>>({});
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const loadOverview = useCallback(async () => {
    setError(undefined);
    try {
      const data = await apiRequest<DashboardOverview>('/monitoring/dashboard/overview');
      setOverview(data);
      setWorkerHashrates(Object.fromEntries(data.workerSnapshots.map((snapshot) => [snapshot.workerId, Number(snapshot.hashrate)])));
    } catch (cause: unknown) {
      if (cause instanceof ApiRequestError && cause.status === 401) {
        router.replace('/login');
        return;
      }
      setError('Snapshot produksi belum dapat dimuat. Periksa koneksi API dan coba kembali.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const initialLoadTimer = window.setTimeout(() => void loadOverview(), 0);

    const socket = io(socketNamespaceUrl, {
      path: '/socket.io',
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('hashrate.updated', (payload: HashrateUpdatedPayload) => {
      setWorkerHashrates((current) => ({ ...current, [payload.workerId]: Number(payload.hashesPerSecond) }));
      setOverview((current) => current ? {
        ...current,
        shares: {
          ...current.shares,
          accepted: current.shares.accepted + payload.acceptedShares,
          rejected: current.shares.rejected + payload.rejectedShares,
        },
        generatedAt: payload.recordedAt,
      } : current);
    });

    return () => {
      window.clearTimeout(initialLoadTimer);
      socket.disconnect();
    };
  }, [loadOverview]);

  const totalHashrate = useMemo(
    () => Object.values(workerHashrates).reduce((sum, value) => sum + value, 0),
    [workerHashrates],
  );

  const acceptedShares = overview?.shares.accepted ?? 0;
  const rejectedShares = overview?.shares.rejected ?? 0;
  const totalShares = acceptedShares + rejectedShares;
  const acceptanceRate = totalShares > 0 ? (acceptedShares / totalShares) * 100 : 0;
  const activeWorkers = overview?.workers.byStatus.ONLINE ?? 0;
  const offlineWorkers = overview?.workers.byStatus.OFFLINE ?? 0;
  const displayedHashrate = totalHashrate || Number(overview?.hashrate5m ?? 0);

  const cards = [
    {
      label: 'Hashrate 5 menit',
      value: formatHashrate(displayedHashrate),
      detail: 'Agregat seluruh worker aktif',
      icon: Gauge,
      tone: 'cyan',
    },
    {
      label: 'Worker online',
      value: `${activeWorkers} / ${overview?.workers.total ?? 0}`,
      detail: offlineWorkers ? `${offlineWorkers} worker memerlukan perhatian` : 'Tidak ada worker offline',
      icon: Cpu,
      tone: offlineWorkers ? 'amber' : 'lime',
    },
    {
      label: 'Share acceptance',
      value: `${acceptanceRate.toFixed(totalShares ? 2 : 0)}%`,
      detail: `${acceptedShares.toLocaleString('id-ID')} accepted · ${rejectedShares.toLocaleString('id-ID')} rejected`,
      icon: ShieldCheck,
      tone: acceptanceRate >= 98 || totalShares === 0 ? 'lime' : 'amber',
    },
    {
      label: 'Notifikasi belum dibaca',
      value: String(overview?.unreadNotifications ?? 0),
      detail: 'Security, worker, dan system event',
      icon: BellRing,
      tone: overview?.unreadNotifications ? 'amber' : 'slate',
    },
  ] as const;

  return (
    <div className="space-y-5 lg:space-y-6">
      <section className="dashboard-card relative overflow-hidden rounded-3xl p-5 sm:p-6 lg:p-7">
        <div className="pointer-events-none absolute -right-20 -top-28 size-64 rounded-full bg-[#98f5ff]/8 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-semibold ${connected ? 'border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-100' : 'border-amber-300/20 bg-amber-300/[0.06] text-amber-100'}`}>
                <span className={`size-1.5 rounded-full ${connected ? 'animate-pulse bg-emerald-300' : 'bg-amber-300'}`} />
                Realtime {connected ? 'terhubung' : 'menyambungkan'}
              </span>
              <span className="mono-font rounded-full border border-white/10 px-3 py-1.5 text-[9px] uppercase tracking-[0.15em] text-[#8fa4b4]">PostgreSQL + Redis Stream</span>
            </div>
            <h2 className="display-font mt-5 text-2xl font-bold tracking-[-0.035em] sm:text-3xl">Operational mining snapshot</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">Pandangan langsung terhadap worker, share quality, dan telemetry hashrate pada pipeline produksi.</p>
          </div>
          <button type="button" onClick={() => void loadOverview()} disabled={loading} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2.5 text-sm font-semibold text-[#d6e2e9] transition hover:border-[#98f5ff]/25 hover:bg-[#98f5ff]/8 disabled:opacity-50">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh snapshot
          </button>
        </div>
      </section>

      {error ? (
        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-red-300/15 bg-red-300/[0.045] p-4 text-sm text-red-100 sm:flex-row sm:items-center">
          <span>{error}</span>
          <button type="button" onClick={() => void loadOverview()} className="font-semibold underline underline-offset-4">Coba kembali</button>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, detail, icon: Icon, tone }) => {
          const toneClass = {
            cyan: 'bg-[#98f5ff]/10 text-[#98f5ff]',
            lime: 'bg-[var(--accent)]/10 text-[var(--accent)]',
            amber: 'bg-amber-300/10 text-amber-200',
            slate: 'bg-white/[0.055] text-[#b6c6d1]',
          }[tone];
          return (
            <article key={label} className="dashboard-card rounded-2xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-[var(--muted)]">{label}</p>
                  <p className="display-font mt-3 text-2xl font-bold tracking-[-0.035em] text-white">{loading ? '—' : value}</p>
                </div>
                <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${toneClass}`}><Icon size={18} /></span>
              </div>
              <p className="mt-4 min-h-8 text-[11px] leading-4 text-[#7890a2]">{detail}</p>
            </article>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <section className="dashboard-card rounded-3xl p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="mono-font text-[9px] uppercase tracking-[0.18em] text-[#71899a]">Live distribution</p>
              <h3 className="mt-2 text-lg font-semibold">Hashrate per worker</h3>
            </div>
            <span className="text-xs text-[var(--muted)]">{Object.keys(workerHashrates).length} telemetry source</span>
          </div>

          <div className="mt-5 space-y-3">
            {Object.entries(workerHashrates).length ? Object.entries(workerHashrates)
              .sort(([, left], [, right]) => right - left)
              .slice(0, 8)
              .map(([workerId, hashrate]) => {
                const share = displayedHashrate > 0 ? Math.min((hashrate / displayedHashrate) * 100, 100) : 0;
                return (
                  <div key={workerId} className="dashboard-inset rounded-2xl p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">Worker {workerId.slice(0, 8)}</p>
                        <p className="mono-font mt-1 truncate text-[9px] text-[#6f8799]">{workerId}</p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold text-[#c9f7fb]">{formatHashrate(hashrate)}</p>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.055]">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#98f5ff] to-[var(--accent)] transition-all duration-500" style={{ width: `${Math.max(share, hashrate > 0 ? 2 : 0)}%` }} />
                    </div>
                  </div>
                );
              }) : (
              <div className="grid min-h-44 place-items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.015] p-6 text-center">
                <div>
                  <RadioTower className="mx-auto text-[#587286]" size={24} />
                  <p className="mt-3 text-sm font-semibold text-[#b6c6d1]">Menunggu telemetry worker</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">Hashrate akan muncul setelah worker mengirim snapshot pertama.</p>
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="space-y-5">
          <section className="dashboard-card rounded-3xl p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]"><Activity size={18} /></span>
              <div><p className="text-sm font-semibold">Share quality</p><p className="text-xs text-[var(--muted)]">Current snapshot</p></div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="dashboard-inset rounded-2xl p-4">
                <ArrowUpRight className="text-emerald-200" size={16} />
                <p className="mt-3 text-xl font-bold">{acceptedShares.toLocaleString('id-ID')}</p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">Accepted</p>
              </div>
              <div className="dashboard-inset rounded-2xl p-4">
                <ArrowDownRight className="text-red-200" size={16} />
                <p className="mt-3 text-xl font-bold">{rejectedShares.toLocaleString('id-ID')}</p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">Rejected</p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-amber-300/15 bg-amber-300/[0.045] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              {overview?.accounting.enabled ? <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-200" size={18} /> : <CircleOff className="mt-0.5 shrink-0 text-amber-200" size={18} />}
              <div>
                <p className="text-sm font-semibold text-amber-50">Financial settlement gated</p>
                <p className="mt-2 text-xs leading-5 text-amber-100/65">{overview?.accounting.reason ?? 'Reward settlement, wallet orchestration, dan payout menunggu release gate.'}</p>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="flex flex-col justify-between gap-2 border-t border-white/8 pt-4 text-[10px] text-[#61798b] sm:flex-row sm:items-center">
        <span>Snapshot terakhir: {formatTimestamp(overview?.generatedAt)}</span>
        <span className="mono-font uppercase tracking-[0.13em]">Production dashboard alpha</span>
      </div>
    </div>
  );
}
