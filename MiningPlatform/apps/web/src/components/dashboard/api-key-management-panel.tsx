/** MiningPlatform — Author: Abia Nugrahanto */
'use client';

import type { FormEvent} from 'react';
import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '@/services/api-client';

const scopeOptions = ['workers:read', 'workers:write', 'dashboard:read', 'profile:read', 'notifications:write'];
interface ApiKeySummary { id: string; keyId: string; name: string; scopes: string[]; status: string; expiresAt?: string | null; lastUsedAt?: string | null; createdAt: string; }

export function ApiKeyManagementPanel() {
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [issuedToken, setIssuedToken] = useState<string>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try { setKeys(await apiRequest<ApiKeySummary[]>('/api-keys')); }
    catch { setError('API key tidak dapat dimuat.'); }
  }, []);
  useEffect(() => {
  let ignore = false;

  void apiRequest<ApiKeySummary[]>('/api-keys')
    .then((result) => {
      if (!ignore) {
        setKeys(result);
      }
    })
    .catch(() => {
      if (!ignore) {
        setError('API key tidak dapat dimuat.');
      }
    });

  return () => {
    ignore = true;
  };
}, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setIssuedToken(undefined);
    const data = new FormData(event.currentTarget);
    try {
      const result = await apiRequest<ApiKeySummary & { token: string }>('/api-keys', {
        method: 'POST',
        body: JSON.stringify({
          name: data.get('name'),
          scopes: data.getAll('scopes'),
          expiresAt: data.get('expiresAt') ? new Date(String(data.get('expiresAt'))).toISOString() : undefined,
        }),
      });
      setIssuedToken(result.token);
      event.currentTarget.reset();
      await load();
    } catch { setError('API key gagal dibuat. Pilih sedikitnya satu scope.'); }
  }

  async function revoke(id: string) {
    try { await apiRequest(`/api-keys/${id}`, { method: 'DELETE' }); await load(); }
    catch { setError('API key gagal dicabut.'); }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="space-y-4 rounded-2xl border border-white/10 bg-[var(--surface)] p-5">
        <div className="grid gap-3 md:grid-cols-2"><input name="name" required minLength={2} placeholder="Nama integrasi" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3" /><input name="expiresAt" type="datetime-local" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3" /></div>
        <fieldset><legend className="text-sm text-[var(--muted)]">Scope</legend><div className="mt-2 flex flex-wrap gap-3">{scopeOptions.map((scope) => <label key={scope} className="rounded-lg border border-white/10 px-3 py-2 text-xs"><input type="checkbox" name="scopes" value={scope} className="mr-2" />{scope}</label>)}</div></fieldset>
        <button className="rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-[#04110c]">Buat API key</button>
      </form>
      {issuedToken && <div className="rounded-2xl border border-amber-300/20 bg-amber-300/5 p-5"><p className="font-semibold text-amber-100">Salin token sekarang. Secret tidak dapat ditampilkan kembali.</p><code className="mt-3 block break-all text-xs">{issuedToken}</code></div>}
      <div className="space-y-3">{keys.map((key) => <article key={key.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[var(--surface)] p-5 text-sm"><div><p className="font-semibold">{key.name}</p><p className="mt-1 font-mono text-xs text-[var(--muted)]">{key.keyId}</p><p className="mt-2 text-xs text-[var(--muted)]">{key.scopes.join(', ')} · {key.status}</p></div>{key.status === 'ACTIVE' && <button onClick={() => void revoke(key.id)} className="rounded-lg border border-red-300/20 px-3 py-2 text-xs text-red-100">Cabut</button>}</article>)}</div>
      {error && <p className="rounded-xl border border-red-300/20 bg-red-300/5 p-3 text-sm text-red-100">{error}</p>}
    </div>
  );
}
