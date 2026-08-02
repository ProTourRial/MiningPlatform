/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiFetch } from '@/services/api-client';

interface WorkerView {
  id: string;
  name: string;
  status: string;
  asset: string;
  algorithm: string;
  miningUsername: string;
  hardware: null | { declaredType?: string; detectedType: string; confidence: string; deviceCount: number };
  activeCredentials: number;
  latestHashrate: string;
  lastConnectedAt?: string;
  lastShareAt?: string;
}

interface CredentialView {
  id: string;
  credentialId: string;
  status: string;
  expiresAt?: string;
  lastUsedAt?: string;
  createdAt: string;
}

function formatHashrate(raw: string) {
  let value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return '0 H/s';
  const units = ['H/s', 'KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s'];
  let unit = 0;
  while (value >= 1_000 && unit < units.length - 1) { value /= 1_000; unit += 1; }
  return `${value.toFixed(value >= 100 ? 0 : 2)} ${units[unit]}`;
}

export function WorkersManager() {
  const [workers, setWorkers] = useState<WorkerView[]>([]);
  const [selected, setSelected] = useState<string>();
  const [credentials, setCredentials] = useState<CredentialView[]>([]);
  const [oneTimeSecret, setOneTimeSecret] = useState('');
  const [message, setMessage] = useState('');

  async function loadWorkers() {
    try { setWorkers(await apiFetch<WorkerView[]>('/workers')); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Worker gagal dimuat'); }
  }
  async function loadCredentials(workerId: string) {
    setSelected(workerId);
    setCredentials(await apiFetch<CredentialView[]>(`/credentials/workers/${workerId}`));
    setOneTimeSecret('');
  }
  useEffect(() => { void loadWorkers(); }, []);

  async function createWorker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await apiFetch('/workers', { method: 'POST', body: JSON.stringify({ name: data.get('name'), declaredType: data.get('declaredType') }) });
      event.currentTarget.reset();
      setMessage('Worker dibuat. Buat credential sebelum menghubungkan miner.');
      await loadWorkers();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Worker gagal dibuat'); }
  }

  async function createCredential(workerId: string) {
    try {
      const result = await apiFetch<{ credentialId: string; secret: string }>(`/credentials/workers/${workerId}`, { method: 'POST', body: '{}' });
      setOneTimeSecret(`${result.credentialId}:${result.secret}`);
      await loadCredentials(workerId);
      await loadWorkers();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Credential gagal dibuat'); }
  }

  async function rotateCredential(credentialId: string) {
    const result = await apiFetch<{ credentialId: string; secret: string }>(`/credentials/${credentialId}/rotate`, { method: 'POST', body: '{}' });
    setOneTimeSecret(`${result.credentialId}:${result.secret}`);
    if (selected) await loadCredentials(selected);
  }

  async function revokeCredential(credentialId: string) {
    await apiFetch(`/credentials/${credentialId}/revoke`, { method: 'POST', body: JSON.stringify({ reason: 'USER_REQUEST' }) });
    if (selected) await loadCredentials(selected);
  }

  async function removeWorker(workerId: string) {
    if (!window.confirm('Nonaktifkan worker dan cabut credential aktif?')) return;
    await apiFetch(`/workers/${workerId}`, { method: 'DELETE' });
    if (selected === workerId) { setSelected(undefined); setCredentials([]); }
    await loadWorkers();
  }

  return <div className="space-y-6">
    <form onSubmit={createWorker} className="grid gap-4 rounded-2xl border border-white/10 bg-[var(--surface)] p-5 md:grid-cols-[1fr_220px_auto]">
      <label className="text-sm">Nama worker<input name="name" required pattern="[a-zA-Z0-9._-]+" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3" placeholder="farm01-gpu01" /></label>
      <label className="text-sm">Hardware<select name="declaredType" className="mt-2 w-full rounded-xl border border-white/10 bg-[#08120f] px-4 py-3"><option>ASIC</option><option>GPU</option><option>CPU</option><option>FPGA</option><option>HYBRID</option><option>OTHER</option><option>UNKNOWN</option></select></label>
      <button className="self-end rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-[#04110c]">Tambah worker</button>
    </form>
    {message && <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">{message}</p>}
    <div className="grid gap-4 xl:grid-cols-2">{workers.map((worker) => <article key={worker.id} className="rounded-2xl border border-white/10 bg-[var(--surface)] p-5">
      <div className="flex items-start justify-between gap-4"><div><p className="text-lg font-semibold">{worker.miningUsername}.{worker.name}</p><p className="mt-1 text-xs text-[var(--muted)]">{worker.asset} · {worker.algorithm} · {worker.hardware?.detectedType ?? 'UNKNOWN'}</p></div><span className="rounded-full border border-white/10 px-3 py-1 text-xs">{worker.status}</span></div>
      <div className="mt-5 grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl border border-white/10 p-3"><p className="text-[var(--muted)]">Hashrate</p><p className="mt-1 font-medium">{formatHashrate(worker.latestHashrate)}</p></div><div className="rounded-xl border border-white/10 p-3"><p className="text-[var(--muted)]">Credential aktif</p><p className="mt-1 font-medium">{worker.activeCredentials}</p></div></div>
      <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => loadCredentials(worker.id)} className="rounded-lg border border-white/10 px-3 py-2 text-xs">Kelola credential</button><button onClick={() => createCredential(worker.id)} className="rounded-lg border border-cyan-300/20 px-3 py-2 text-xs text-cyan-100">Buat credential</button><button onClick={() => removeWorker(worker.id)} className="rounded-lg border border-red-300/20 px-3 py-2 text-xs text-red-100">Nonaktifkan</button></div>
    </article>)}</div>
    {!workers.length && <div className="rounded-2xl border border-dashed border-white/15 p-8 text-sm text-[var(--muted)]">Belum ada worker. Tambahkan worker pertama di atas.</div>}
    {selected && <section className="rounded-2xl border border-white/10 bg-[var(--surface)] p-5"><div className="flex justify-between"><h2 className="font-semibold">Worker Credentials</h2><button onClick={() => createCredential(selected)} className="rounded-lg border border-cyan-300/20 px-3 py-2 text-xs text-cyan-100">Credential baru</button></div>{oneTimeSecret && <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/5 p-4"><p className="text-xs text-amber-100">Salin sekarang. Nilai ini tidak dapat ditampilkan kembali.</p><code className="mt-2 block break-all text-sm">{oneTimeSecret}</code></div>}<div className="mt-4 grid gap-2">{credentials.map((credential) => <div key={credential.id} className="grid gap-3 rounded-xl border border-white/10 px-4 py-3 text-sm md:grid-cols-[1fr_120px_auto]"><div><p className="font-mono text-xs">{credential.credentialId}</p><p className="mt-1 text-xs text-[var(--muted)]">Dibuat {new Date(credential.createdAt).toLocaleString('id-ID')} · terakhir dipakai {credential.lastUsedAt ? new Date(credential.lastUsedAt).toLocaleString('id-ID') : 'belum pernah'}</p></div><span>{credential.status}</span><div className="flex gap-2"><button disabled={credential.status !== 'ACTIVE'} onClick={() => rotateCredential(credential.credentialId)} className="rounded-lg border border-white/10 px-2 py-1 text-xs disabled:opacity-40">Rotate</button><button disabled={credential.status !== 'ACTIVE'} onClick={() => revokeCredential(credential.credentialId)} className="rounded-lg border border-red-300/20 px-2 py-1 text-xs text-red-100 disabled:opacity-40">Revoke</button></div></div>)}</div></section>}
  </div>;
}
