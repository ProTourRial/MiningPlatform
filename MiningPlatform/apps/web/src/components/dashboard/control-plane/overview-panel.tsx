/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/services/api-client';

interface DashboardData {
  workers: { total: number; online: number; offline: number; degraded: number; pending: number };
  hashrate: { hashesPerSecond: string; window: string };
  connectedPools: Array<{ poolKey: string; name: string; status: string; lastConnectedAt?: string }>;
  services: Record<string, { status: string; latencyMs?: number }>;
  recentEvents: Array<{ id: string; category: string; outcome: string; action: string; occurredAt: string }>;
  generatedAt: string;
}

function formatHashrate(value: string) {
  let number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '0 H/s';
  const units = ['H/s', 'KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s'];
  let unit = 0;
  while (number >= 1_000 && unit < units.length - 1) { number /= 1_000; unit += 1; }
  return `${number.toFixed(number >= 100 ? 0 : 2)} ${units[unit]}`;
}

export function OverviewPanel() {
  const [data, setData] = useState<DashboardData>();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const load = () => apiFetch<DashboardData>('/system/dashboard').then((value) => active && setData(value)).catch((reason) => active && setError(reason instanceof Error ? reason.message : 'Dashboard gagal dimuat'));
    void load();
    const timer = setInterval(load, 30_000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  if (error) return <p className="rounded-2xl border border-red-300/20 bg-red-300/5 p-4 text-sm text-red-100">{error}</p>;
  if (!data) return <p className="text-sm text-[var(--muted)]">Memuat dashboard produksi…</p>;
  const cards = [
    ['Workers', data.workers.total], ['Online', data.workers.online], ['Offline', data.workers.offline], ['Hashrate', formatHashrate(data.hashrate.hashesPerSecond)],
  ];
  return <div className="space-y-6">
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value]) => <article key={label} className="rounded-2xl border border-white/10 bg-[var(--surface)] p-5"><p className="text-sm text-[var(--muted)]">{label}</p><p className="mt-3 text-2xl font-semibold">{value}</p></article>)}</div>
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="rounded-2xl border border-white/10 bg-[var(--surface)] p-5"><h2 className="font-semibold">Service Health</h2><div className="mt-4 grid gap-3">{Object.entries(data.services).map(([name, service]) => <div key={name} className="flex justify-between rounded-xl border border-white/10 px-4 py-3 text-sm"><span className="capitalize">{name}</span><span className={service.status === 'ok' ? 'text-emerald-200' : 'text-red-200'}>{service.status}{service.latencyMs !== undefined ? ` · ${service.latencyMs} ms` : ''}</span></div>)}</div></section>
      <section className="rounded-2xl border border-white/10 bg-[var(--surface)] p-5"><h2 className="font-semibold">Connected Pools</h2><div className="mt-4 grid gap-3">{data.connectedPools.length ? data.connectedPools.map((pool) => <div key={pool.poolKey} className="flex justify-between rounded-xl border border-white/10 px-4 py-3 text-sm"><span>{pool.name}</span><span className="text-[var(--muted)]">{pool.status}</span></div>) : <p className="text-sm text-[var(--muted)]">Belum ada upstream pool aktif.</p>}</div></section>
    </div>
    <section className="rounded-2xl border border-white/10 bg-[var(--surface)] p-5"><h2 className="font-semibold">Recent Events</h2><div className="mt-4 grid gap-2">{data.recentEvents.length ? data.recentEvents.map((event) => <div key={event.id} className="grid gap-1 rounded-xl border border-white/10 px-4 py-3 text-sm md:grid-cols-[140px_1fr_auto]"><span className="text-[var(--muted)]">{event.category}</span><span>{event.action}</span><span className="text-xs text-[var(--muted)]">{new Date(event.occurredAt).toLocaleString('id-ID')}</span></div>) : <p className="text-sm text-[var(--muted)]">Belum ada audit event.</p>}</div></section>
  </div>;
}
