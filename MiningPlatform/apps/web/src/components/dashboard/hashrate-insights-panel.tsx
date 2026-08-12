/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

'use client';

import { Activity, BarChart3, Clock3, Cpu, Gauge, RefreshCw, Signal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '@/services/api-client';

interface WorkerHashrate {
  id: string;
  name: string;
  status: string;
  hashrate5m: string;
  lastConnectedAt: string | null;
  miningAccount: { asset: { symbol: string; algorithm: string } };
}

function formatHashrate(value: number) {
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

export function HashrateInsightsPanel() {
  const [workers, setWorkers] = useState<WorkerHashrate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [updatedAt, setUpdatedAt] = useState<Date>();

  const load = useCallback(async () => {
    setError(undefined);
    try {
      setWorkers(await apiRequest<WorkerHashrate[]>('/workers'));
      setUpdatedAt(new Date());
    } catch {
      setError('Telemetry hashrate belum dapat dimuat.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const ranked = useMemo(
    () => workers.map((worker) => ({ ...worker, value: Number(worker.hashrate5m) || 0 })).sort((left, right) => right.value - left.value),
    [workers],
  );
  const total = ranked.reduce((sum, worker) => sum + worker.value, 0);
  const online = ranked.filter((worker) => worker.status.toUpperCase() === 'ONLINE').length;
  const producing = ranked.filter((worker) => worker.value > 0).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Total hashrate 5m', value: formatHashrate(total), icon: Gauge, tone: 'text-[#98f5ff] bg-[#98f5ff]/10' },
          { label: 'Worker online', value: `${online} / ${workers.length}`, icon: Signal, tone: 'text-[var(--accent)] bg-[var(--accent)]/10' },
          { label: 'Mengirim telemetry', value: `${producing} worker`, icon: Activity, tone: 'text-amber-200 bg-amber-300/10' },
        ].map(({ label, value, icon: Icon, tone }) => (
          <article key={label} className="dashboard-card rounded-2xl p-5 sm:p-6">
            <span className={`grid size-10 place-items-center rounded-xl ${tone}`}><Icon size={18} /></span>
            <p className="mt-5 text-xs text-[var(--muted)]">{label}</p>
            <p className="display-font mt-2 text-2xl font-bold tracking-[-0.035em]">{loading ? '—' : value}</p>
          </article>
        ))}
      </div>

      {error ? <p className="rounded-2xl border border-red-300/15 bg-red-300/[0.045] p-4 text-sm text-red-100">{error}</p> : null}

      <section className="dashboard-card rounded-3xl p-5 sm:p-6 lg:p-7">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="mono-font text-[9px] uppercase tracking-[0.18em] text-[#71899a]">Five-minute window</p>
            <h2 className="mt-2 text-xl font-semibold">Worker contribution</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Distribusi snapshot terbaru, diurutkan dari kontribusi terbesar.</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-xs font-semibold text-[#b8c8d5] transition hover:bg-white/[0.035] disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh data
          </button>
        </div>

        <div className="mt-7 space-y-3">
          {ranked.map((worker, index) => {
            const share = total > 0 ? (worker.value / total) * 100 : 0;
            return (
              <article key={worker.id} className="dashboard-inset rounded-2xl p-4 sm:p-5">
                <div className="flex items-center gap-4">
                  <span className="mono-font grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.045] text-[10px] text-[#8da3b5]">{String(index + 1).padStart(2, '0')}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center sm:gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{worker.name}</p>
                        <p className="mt-1 text-[10px] text-[var(--muted)]">{worker.miningAccount.asset.symbol} · {worker.miningAccount.asset.algorithm}</p>
                      </div>
                      <div className="shrink-0 sm:text-right">
                        <p className="text-sm font-bold text-[#d5f9fb]">{formatHashrate(worker.value)}</p>
                        <p className="mt-1 text-[9px] text-[var(--muted)]">{share.toFixed(2)}% dari total</p>
                      </div>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.055]">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#98f5ff] to-[var(--accent)]" style={{ width: `${Math.max(share, worker.value > 0 ? 1.5 : 0)}%` }} />
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {!ranked.length && !loading ? (
          <div className="mt-7 grid min-h-52 place-items-center rounded-2xl border border-dashed border-white/10 p-8 text-center">
            <div><Cpu className="mx-auto text-[#587286]" size={26} /><p className="mt-3 text-sm font-semibold">Belum ada telemetry</p><p className="mt-1 text-xs text-[var(--muted)]">Hubungkan worker untuk memulai pengukuran hashrate.</p></div>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 rounded-3xl border border-[#98f5ff]/12 bg-[#98f5ff]/[0.035] p-5 sm:grid-cols-[auto_1fr] sm:items-center sm:p-6">
        <span className="grid size-11 place-items-center rounded-xl bg-[#98f5ff]/10 text-[#98f5ff]"><BarChart3 size={19} /></span>
        <div>
          <p className="text-sm font-semibold">Historical trend tetap berada di release gate monitoring</p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Halaman ini hanya menampilkan snapshot 5 menit yang tervalidasi. Grafik historis akan diaktifkan setelah endpoint time-series dan kebijakan retensi dinyatakan stabil.</p>
        </div>
      </section>

      <p className="flex items-center gap-2 text-[10px] text-[#61798b]"><Clock3 size={12} /> Terakhir diperbarui {updatedAt ? updatedAt.toLocaleString('id-ID') : '—'} · refresh otomatis setiap 30 detik</p>
    </div>
  );
}
