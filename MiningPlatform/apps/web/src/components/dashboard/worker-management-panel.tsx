/** MiningPlatform — Author: Abia Nugrahanto 
 * Gabut bet gua sampe sini (curhat dikit) -- 2026 
 * Awas aja kalo besok ada yang beli web ini lu ga jual di atas 1 Triliun rupiah sialan.. lemburan abis tabrakan jam segini 02:13  
*/
'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
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

export function WorkerManagementPanel() {
  const [workers, setWorkers] = useState<WorkerSummary[]>([]);
  const [issued, setIssued] = useState<IssuedCredential>();
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      setWorkers(await apiRequest<WorkerSummary[]>('/workers'));
    } catch {
      setError('Daftar worker tidak dapat dimuat.');
    }
  }, []);

  useEffect(() => {
  let ignore = false;

  void apiRequest<WorkerSummary[]>('/workers')
    .then((result) => {
      if (!ignore) {
        setWorkers(result);
      }
    })
    .catch(() => {
      if (!ignore) {
        setError('Daftar worker tidak dapat dimuat.');
      }
    });

  return () => {
    ignore = true;
  };
}, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    setIssued(undefined);
    const data = new FormData(event.currentTarget);
    let result: { connection: IssuedCredential };
    try {
      result = await apiRequest('/workers', {
        method: 'POST',
        body: JSON.stringify({ name: data.get('name'), declaredHardwareType: data.get('hardwareType') }),
      });
    } catch {
      setSubmitting(false);
      setError('Worker gagal dibuat. Nama mungkin sudah digunakan.');
      return;
    }
    setSubmitting(false);
    setIssued(result.connection);
    event.currentTarget.reset();
    await load();
  }

  async function rotate(workerId: string) {
    setIssued(undefined);
    let result: { connectionUsername: string; password: string; credentialId: string };
    try {
      result = await apiRequest(`/workers/${workerId}/credentials/rotate`, { method: 'POST', body: '{}' });
    } catch {
      setError('Rotasi kredensial gagal.');
      return;
    }
    setIssued({ username: result.connectionUsername, password: result.password, credentialId: result.credentialId });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="grid gap-3 rounded-2xl border border-white/10 bg-[var(--surface)] p-5 md:grid-cols-[1fr_180px_auto]">
        <input name="name" required pattern="[a-zA-Z0-9_.-]{1,64}" placeholder="worker1" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3" />
        <select name="hardwareType" defaultValue="ASIC" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
          {['ASIC', 'GPU', 'CPU', 'FPGA', 'HYBRID', 'OTHER'].map((type) => <option key={type}>{type}</option>)}
        </select>
        <button disabled={submitting} className="rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-[#04110c] disabled:opacity-50">Tambah worker</button>
      </form>

      {issued && (
        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/5 p-5">
          <p className="font-semibold text-amber-100">Simpan kredensial ini sekarang. Password hanya ditampilkan sekali.</p>
          <dl className="mt-3 grid gap-2 break-all text-sm">
            <div><dt className="text-[var(--muted)]">Username</dt><dd>{issued.username}</dd></div>
            <div><dt className="text-[var(--muted)]">Password</dt><dd>{issued.password}</dd></div>
            <div><dt className="text-[var(--muted)]">Credential ID</dt><dd>{issued.credentialId}</dd></div>
          </dl>
        </div>
      )}
      {error && <p className="rounded-xl border border-red-300/20 bg-red-300/5 p-3 text-sm text-red-100">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {workers.map((worker) => (
          <article key={worker.id} className="rounded-2xl border border-white/10 bg-[var(--surface)] p-5">
            <div className="flex items-center justify-between gap-4">
              <div><h3 className="font-semibold">{worker.name}</h3><p className="mt-1 text-xs text-[var(--muted)]">{worker.connectionUsername}</p></div>
              <span className="rounded-full border border-white/10 px-3 py-1 text-xs">{worker.status}</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-[var(--muted)]">Algoritma</p><p>{worker.miningAccount.asset.symbol} / {worker.miningAccount.asset.algorithm}</p></div>
              <div><p className="text-[var(--muted)]">Hashrate 5m</p><p>{worker.hashrate5m} H/s</p></div>
            </div>
            <button onClick={() => void rotate(worker.id)} className="mt-5 rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/5">Rotasi password</button>
          </article>
        ))}
      </div>
      {workers.length === 0 && <p className="text-sm text-[var(--muted)]">Belum ada worker. Tambahkan worker pertama untuk memperoleh username dan password Stratum.</p>}
    </div>
  );
}
