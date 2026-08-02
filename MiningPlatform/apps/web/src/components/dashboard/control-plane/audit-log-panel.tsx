/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/services/api-client';

interface AuditEventView {
  id: string;
  category: string;
  outcome: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  occurredAt: string;
}

export function AuditLogPanel() {
  const [events, setEvents] = useState<AuditEventView[]>([]);
  const [error, setError] = useState('');
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    let active = true;
    apiFetch<AuditEventView[]>(`/audit?limit=${limit}`)
      .then((value) => active && setEvents(value))
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : 'Audit log gagal dimuat'));
    return () => { active = false; };
  }, [limit]);

  return <section className="rounded-2xl border border-white/10 bg-[var(--surface)] p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-semibold">Audit Log</h2><p className="mt-1 text-sm text-[var(--muted)]">Riwayat login, keamanan, worker, credential, dan perubahan akun.</p></div>
      <select value={limit} onChange={(event) => setLimit(Number(event.target.value))} className="rounded-xl border border-white/10 bg-[#08120f] px-3 py-2 text-sm"><option value={25}>25 event</option><option value={50}>50 event</option><option value={100}>100 event</option><option value={200}>200 event</option></select>
    </div>
    {error && <p className="mt-4 rounded-xl border border-red-300/20 bg-red-300/5 p-3 text-sm text-red-100">{error}</p>}
    <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]"><tr><th className="pb-3">Waktu</th><th className="pb-3">Kategori</th><th className="pb-3">Aksi</th><th className="pb-3">Resource</th><th className="pb-3">Hasil</th></tr></thead><tbody>{events.map((event) => <tr key={event.id} className="border-t border-white/10"><td className="py-3 text-xs text-[var(--muted)]">{new Date(event.occurredAt).toLocaleString('id-ID')}</td><td className="py-3">{event.category}</td><td className="py-3 font-medium">{event.action}</td><td className="py-3 text-[var(--muted)]">{event.resourceType}{event.resourceId ? ` · ${event.resourceId}` : ''}</td><td className="py-3"><span className={`rounded-full border px-2 py-1 text-[10px] ${event.outcome === 'SUCCESS' ? 'border-emerald-300/20 text-emerald-100' : 'border-red-300/20 text-red-100'}`}>{event.outcome}</span></td></tr>)}</tbody></table></div>
    {!events.length && !error && <p className="mt-5 text-sm text-[var(--muted)]">Belum ada audit event.</p>}
  </section>;
}
