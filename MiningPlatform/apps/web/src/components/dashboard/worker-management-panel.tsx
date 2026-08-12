/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

'use client';

import {
  Check,
  Clock3,
  Copy,
  Cpu,
  Gauge,
  KeyRound,
  Plus,
  RefreshCw,
  ServerCog,
  ShieldAlert,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { FormEvent} from 'react';
import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '@/services/api-client';

interface WorkerSummary {
  id: string;
  name: string;
  status: string;
  connectionUsername: string;
  hashrate5m: string;
  lastConnectedAt: string | null;
  miningAccount: { asset: { symbol: string; algorithm: string } };
}

interface IssuedCredential {
  username: string;
  password: string;
  credentialId: string;
}

function formatHashrate(value: string) {
  let number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '0 H/s';
  const units = ['H/s', 'KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s'];
  let unit = 0;
  while (number >= 1_000 && unit < units.length - 1) {
    number /= 1_000;
    unit += 1;
  }
  return `${number.toFixed(number >= 100 ? 0 : 2)} ${units[unit]}`;
}

function statusStyle(status: string) {
  switch (status.toUpperCase()) {
    case 'ONLINE': return 'border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-100';
    case 'DEGRADED': return 'border-amber-300/20 bg-amber-300/[0.06] text-amber-100';
    default: return 'border-white/10 bg-white/[0.035] text-[#9db0bf]';
  }
}

export function WorkerManagementPanel() {
  const [workers, setWorkers] = useState<WorkerSummary[]>([]);
  const [issued, setIssued] = useState<IssuedCredential>();
  const [rotateTarget, setRotateTarget] = useState<WorkerSummary>();
  const [copied, setCopied] = useState<string>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setError(undefined);
    try {
      setWorkers(await apiRequest<WorkerSummary[]>('/workers'));
    } catch {
      setError('Daftar worker belum dapat dimuat. Periksa koneksi API lalu coba kembali.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    setIssued(undefined);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const result = await apiRequest<{ connection: IssuedCredential }>('/workers', {
        method: 'POST',
        body: JSON.stringify({
          name: data.get('name'),
          declaredHardwareType: data.get('hardwareType'),
        }),
      });
      setIssued(result.connection);
      form.reset();
      await load();
    } catch {
      setError('Worker gagal dibuat. Pastikan nama unik dan hanya menggunakan huruf, angka, titik, garis bawah, atau tanda hubung.');
    } finally {
      setSubmitting(false);
    }
  }

  async function rotate() {
    if (!rotateTarget) return;
    setSubmitting(true);
    setError(undefined);
    setIssued(undefined);
    try {
      const result = await apiRequest<{ connectionUsername: string; password: string; credentialId: string }>(`/workers/${rotateTarget.id}/credentials/rotate`, {
        method: 'POST',
        body: '{}',
      });
      setIssued({ username: result.connectionUsername, password: result.password, credentialId: result.credentialId });
      setRotateTarget(undefined);
    } catch {
      setError('Rotasi kredensial gagal. Kredensial lama belum diubah.');
    } finally {
      setSubmitting(false);
    }
  }

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(undefined), 1800);
    } catch {
      setError('Clipboard tidak tersedia. Salin nilai secara manual.');
    }
  }

  return (
    <div className="space-y-6">
      <section className="dashboard-card rounded-3xl p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <p className="mono-font text-[9px] uppercase tracking-[0.18em] text-[var(--accent)]">Provisioning</p>
            <h2 className="mt-2 text-lg font-semibold">Daftarkan worker baru</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Satu identitas dan password Stratum terpisah untuk setiap perangkat.</p>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-[#7890a2]">
            <ShieldAlert size={14} className="text-amber-200" /> Secret hanya ditampilkan satu kali
          </div>
        </div>

        <form onSubmit={create} className="mt-6 grid gap-3 lg:grid-cols-[1fr_210px_auto]">
          <label className="sr-only" htmlFor="worker-name">Nama worker</label>
          <input id="worker-name" name="name" required pattern="[a-zA-Z0-9_.-]{1,64}" placeholder="contoh: farm-a.rack-01" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none transition placeholder:text-[#51697c] focus:border-[var(--accent)]/55" />
          <label className="sr-only" htmlFor="hardware-type">Jenis hardware</label>
          <select id="hardware-type" name="hardwareType" defaultValue="ASIC" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]/55">
            {['ASIC', 'GPU', 'CPU', 'FPGA', 'HYBRID', 'OTHER'].map((type) => <option key={type}>{type}</option>)}
          </select>
          <button disabled={submitting} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-bold text-[#04110c] transition hover:bg-[#e3ff91] disabled:opacity-50">
            {submitting ? <RefreshCw size={16} className="animate-spin" /> : <Plus size={16} />} Tambah worker
          </button>
        </form>
      </section>

      {issued ? (
        <section className="relative overflow-hidden rounded-3xl border border-amber-300/20 bg-amber-300/[0.05] p-5 sm:p-6">
          <div className="pointer-events-none absolute -right-12 -top-16 size-48 rounded-full bg-amber-300/8 blur-3xl" />
          <div className="relative flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-300/10 text-amber-200"><KeyRound size={18} /></span>
            <div>
              <h2 className="font-semibold text-amber-50">Kredensial siap digunakan</h2>
              <p className="mt-1 text-sm leading-6 text-amber-100/65">Simpan ketiga nilai ini sekarang. Password tidak dapat ditampilkan kembali setelah panel ditutup.</p>
            </div>
          </div>
          <div className="relative mt-5 grid gap-3">
            {([
              ['Username', issued.username],
              ['Password', issued.password],
              ['Credential ID', issued.credentialId],
            ] as const).map(([label, value]) => (
              <div key={label} className="flex items-center gap-3 rounded-2xl border border-amber-100/10 bg-black/15 p-3 sm:p-4">
                <div className="min-w-0 flex-1">
                  <p className="mono-font text-[8px] uppercase tracking-[0.15em] text-amber-100/50">{label}</p>
                  <code className="mt-1.5 block truncate text-xs text-amber-50 sm:text-sm">{value}</code>
                </div>
                <button type="button" onClick={() => void copy(label, value)} className="grid size-9 shrink-0 place-items-center rounded-lg border border-amber-100/10 text-amber-100/70 transition hover:bg-amber-100/8 hover:text-amber-50" aria-label={`Salin ${label}`}>
                  {copied === label ? <Check size={15} /> : <Copy size={15} />}
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {error ? (
        <div className="flex flex-col justify-between gap-3 rounded-2xl border border-red-300/15 bg-red-300/[0.045] p-4 text-sm text-red-100 sm:flex-row sm:items-center">
          <span>{error}</span>
          <button type="button" onClick={() => void load()} className="font-semibold underline underline-offset-4">Muat ulang</button>
        </div>
      ) : null}

      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mono-font text-[9px] uppercase tracking-[0.18em] text-[#71899a]">Worker registry</p>
            <h2 className="mt-2 text-xl font-semibold">Perangkat terdaftar</h2>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-[#aebfcb] transition hover:bg-white/[0.035] disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {workers.map((worker) => {
            const online = worker.status.toUpperCase() === 'ONLINE';
            return (
              <article key={worker.id} className="dashboard-card group rounded-3xl p-5 transition hover:border-white/15 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${online ? 'bg-emerald-300/10 text-emerald-200' : 'bg-white/[0.05] text-[#7890a2]'}`}>
                      {online ? <Wifi size={19} /> : <WifiOff size={19} />}
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-white">{worker.name}</h3>
                      <p className="mono-font mt-1 truncate text-[9px] text-[#6f8799]">{worker.connectionUsername}</p>
                    </div>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] ${statusStyle(worker.status)}`}>{worker.status}</span>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3">
                  <div className="dashboard-inset rounded-2xl p-4">
                    <Gauge size={15} className="text-[#98f5ff]" />
                    <p className="mt-3 text-lg font-bold">{formatHashrate(worker.hashrate5m)}</p>
                    <p className="mt-1 text-[9px] uppercase tracking-[0.12em] text-[var(--muted)]">Hashrate 5m</p>
                  </div>
                  <div className="dashboard-inset rounded-2xl p-4">
                    <ServerCog size={15} className="text-[var(--accent)]" />
                    <p className="mt-3 text-lg font-bold">{worker.miningAccount.asset.symbol}</p>
                    <p className="mt-1 text-[9px] uppercase tracking-[0.12em] text-[var(--muted)]">{worker.miningAccount.asset.algorithm}</p>
                  </div>
                </div>

                <div className="mt-5 flex flex-col justify-between gap-3 border-t border-white/8 pt-4 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-2 text-[10px] text-[#7890a2]">
                    <Clock3 size={13} />
                    {worker.lastConnectedAt ? `Terakhir terhubung ${new Date(worker.lastConnectedAt).toLocaleString('id-ID')}` : 'Belum pernah terhubung'}
                  </div>
                  <button type="button" onClick={() => setRotateTarget(worker)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-[#b8c8d5] transition hover:border-amber-300/20 hover:bg-amber-300/[0.045] hover:text-amber-100">
                    <KeyRound size={13} /> Rotasi password
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        {!workers.length && !loading ? (
          <div className="mt-5 grid min-h-64 place-items-center rounded-3xl border border-dashed border-white/10 bg-white/[0.015] p-8 text-center">
            <div>
              <Cpu className="mx-auto text-[#587286]" size={28} />
              <h3 className="mt-4 font-semibold">Belum ada worker</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">Tambahkan perangkat pertama untuk memperoleh username dan password Stratum produksi.</p>
            </div>
          </div>
        ) : null}
      </section>

      {rotateTarget ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="rotate-title">
          <section className="w-full max-w-md rounded-3xl border border-white/12 bg-[#0a1929] p-6 shadow-2xl">
            <span className="grid size-11 place-items-center rounded-xl bg-amber-300/10 text-amber-200"><KeyRound size={19} /></span>
            <h2 id="rotate-title" className="mt-5 text-xl font-semibold">Rotasi password {rotateTarget.name}?</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Password aktif akan segera dicabut. Miner harus dikonfigurasi ulang menggunakan password baru agar dapat terhubung kembali.</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setRotateTarget(undefined)} disabled={submitting} className="rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-[#b8c8d5]">Batal</button>
              <button type="button" onClick={() => void rotate()} disabled={submitting} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 py-3 text-sm font-bold text-[#191305] disabled:opacity-50">
                {submitting ? <RefreshCw size={15} className="animate-spin" /> : <KeyRound size={15} />} Rotasi
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
