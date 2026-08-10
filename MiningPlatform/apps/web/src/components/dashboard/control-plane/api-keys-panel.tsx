/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiFetch } from '@/services/api-client';

interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  status: string;
  permissions: string[];
  expiresAt?: string;
  lastUsedAt?: string;
  createdAt: string;
}

const permissionOptions = ['workers.read', 'audit.read', 'system.read', 'api-keys.read'];

export function ApiKeysPanel() {
  const [keys, setKeys] = useState<ApiKeyView[]>([]);
  const [oneTimeKey, setOneTimeKey] = useState('');
  const [message, setMessage] = useState('');
  async function load() { 
    setKeys(await apiFetch<ApiKeyView[]>('/api-keys')); }
  useEffect(() => {
  let ignore = false;

  void apiFetch<ApiKeyView[]>('/api-keys')
    .then((result) => {
      if (!ignore) {
        setKeys(result);
      }
    })
    .catch((error) => {
      if (!ignore) {
        setMessage(
          error instanceof Error
            ? error.message
            : 'API key gagal dimuat',
        );
      }
    });

  return () => {
    ignore = true;
  };
}, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const permissions = permissionOptions.filter((permission) => data.get(permission) === 'on');
    try {
      const result = await apiFetch<{ apiKey: string }>('/api-keys', { method: 'POST', body: JSON.stringify({ name: data.get('name'), permissions }) });
      setOneTimeKey(result.apiKey);
      setMessage('API key dibuat. Salin sekarang.');
      event.currentTarget.reset();
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'API key gagal dibuat'); }
  }

  async function revoke(id: string) {
    await apiFetch(`/api-keys/${id}`, { method: 'DELETE' });
    await load();
  }

  return <div className="space-y-6">
    <form onSubmit={create} className="space-y-4 rounded-2xl border border-white/10 bg-[var(--surface)] p-5"><h2 className="font-semibold">Create API Key</h2><label className="block text-sm">Nama<input name="name" required className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3" placeholder="Grafana read-only" /></label><fieldset><legend className="text-sm">Permissions</legend><div className="mt-3 grid gap-2 sm:grid-cols-2">{permissionOptions.map((permission) => <label key={permission} className="flex items-center gap-3 rounded-xl border border-white/10 px-4 py-3 text-sm"><input type="checkbox" name={permission} />{permission}</label>)}</div></fieldset><button className="rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-[#04110c]">Create key</button></form>
    {message && <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">{message}</p>}
    {oneTimeKey && <div className="rounded-xl border border-amber-300/30 bg-amber-300/5 p-4"><p className="text-xs text-amber-100">Nilai hanya ditampilkan sekali.</p><code className="mt-2 block break-all text-sm">{oneTimeKey}</code></div>}
    <section className="rounded-2xl border border-white/10 bg-[var(--surface)] p-5"><h2 className="font-semibold">API Keys</h2><div className="mt-4 grid gap-3">{keys.map((key) => <article key={key.id} className="grid gap-3 rounded-xl border border-white/10 p-4 md:grid-cols-[1fr_auto]"><div><div className="flex flex-wrap gap-2"><p className="font-medium">{key.name}</p><code className="text-xs text-[var(--muted)]">{key.prefix}</code><span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px]">{key.status}</span></div><p className="mt-2 text-xs text-[var(--muted)]">{key.permissions.join(', ') || 'No permissions'} · dibuat {new Date(key.createdAt).toLocaleString('id-ID')} · terakhir digunakan {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString('id-ID') : 'belum pernah'}</p></div>{key.status === 'ACTIVE' && <button onClick={() => revoke(key.id)} className="rounded-lg border border-red-300/20 px-3 py-2 text-xs text-red-100">Revoke</button>}</article>)}</div>{!keys.length && <p className="mt-4 text-sm text-[var(--muted)]">Belum ada API key.</p>}</section>
  </div>;
}
