/** MiningPlatform — Author: Abia Nugrahanto */
'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import type { HashrateUpdatedPayload } from '@mining/shared';
import { ApiRequestError, apiRequest } from '@/services/api-client';

const configuredSocketUrl = process.env.NEXT_PUBLIC_SOCKET_URL;
const SOCKET_URL = configuredSocketUrl === undefined ? 'http://localhost:4000' : configuredSocketUrl.replace(/\/$/, '');
const SOCKET_NAMESPACE_URL = `${SOCKET_URL}/mining`;

interface DashboardOverview {
  workers: { total: number; byStatus: Record<string, number> };
  shares: { accepted: number; rejected: number; byStatus: Record<string, number> };
  hashrate5m: string;
  unreadNotifications: number;
  workerSnapshots: Array<{ workerId: string; hashrate: string }>;
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

export function RealtimeMiningPanel() {
  const router = useRouter();
  const [overview, setOverview] = useState<DashboardOverview>();
  const [workerHashrates, setWorkerHashrates] = useState<Record<string, number>>({});
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void apiRequest<DashboardOverview>('/monitoring/dashboard/overview')
      .then((data) => {
        setOverview(data);
        setWorkerHashrates(Object.fromEntries(data.workerSnapshots.map((snapshot) => [snapshot.workerId, Number(snapshot.hashrate)])));
      })
      .catch((cause: unknown) => {
        if (cause instanceof ApiRequestError && cause.status === 401) {
          router.replace('/login');
          return;
        }
        setError('Ringkasan produksi tidak dapat dimuat.');
      });

    const socket = io(SOCKET_NAMESPACE_URL, {
      path: '/socket.io',
      withCredentials: true,
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
    return () => socket.disconnect();
  }, [router]);

  const totalHashrate = useMemo(
    () => Object.values(workerHashrates).reduce((sum, value) => sum + value, 0),
    [workerHashrates],
  );

  const cards = [
    ['Workers', overview?.workers.total.toString() ?? '—'],
    ['Online', (overview?.workers.byStatus.ONLINE ?? 0).toString()],
    ['Hashrate 5 Menit', formatHashrate(totalHashrate || Number(overview?.hashrate5m ?? 0))],
    ['Accepted / Rejected', overview ? `${overview.shares.accepted} / ${overview.shares.rejected}` : '—'],
  ];

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Dashboard Mining Produksi</h2>
          <p className="text-sm text-[var(--muted)]">Snapshot PostgreSQL dan pembaruan Redis Stream melalui WebSocket terautentikasi.</p>
        </div>
        <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-[var(--muted)]">WebSocket {connected ? 'terhubung' : 'terputus'}</span>
      </div>
      {error && <p className="rounded-xl border border-red-300/20 bg-red-300/5 p-3 text-sm text-red-100">{error}</p>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <article key={label} className="rounded-2xl border border-white/10 bg-[var(--surface)] p-5">
            <p className="text-sm text-[var(--muted)]">{label}</p>
            <p className="mt-3 text-2xl font-semibold">{value}</p>
          </article>
        ))}
      </div>
      <div className="rounded-2xl border border-amber-300/15 bg-amber-300/5 p-4 text-sm text-amber-100">
        Accounting tetap dinonaktifkan: {overview?.accounting.reason ?? 'reward settlement, wallet orchestration, dan payout belum melewati release gate.'}
      </div>
      <p className="text-xs text-[var(--muted)]">Pembaruan terakhir: {overview?.generatedAt ? new Date(overview.generatedAt).toLocaleString('id-ID') : 'belum tersedia'}</p>
    </section>
  );
}
