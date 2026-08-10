/** MiningPlatform — Author: Abia Nugrahanto */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiRequestError, apiRequest } from '@/services/api-client';

interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  emailVerifiedAt?: string | null;
  security?: { totpEnabled: boolean; lastLoginAt?: string | null; lockedUntil?: string | null } | null;
  _count: { workers: number; authSessions: number; apiKeys: number };
}

export function AdminManagementPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try { setUsers(await apiRequest<AdminUser[]>('/admin/users')); setError(undefined); }
    catch (cause: unknown) {
      setError(cause instanceof ApiRequestError && cause.status === 403
        ? 'Akses admin memerlukan role ADMIN/OWNER dan TOTP yang sudah aktif.'
        : 'Data admin tidak dapat dimuat.');
    }
  }, []);
  useEffect(() => {
  let ignore = false;

  void apiRequest<AdminUser[]>('/admin/users')
    .then((result) => {
      if (ignore) return;

      setUsers(result);
      setError(undefined);
    })
    .catch((cause: unknown) => {
      if (ignore) return;

      setError(
        cause instanceof ApiRequestError && cause.status === 403
          ? 'Akses admin memerlukan role ADMIN/OWNER dan TOTP yang sudah aktif.'
          : 'Data admin tidak dapat dimuat.',
      );
    });

  return () => {
    ignore = true;
  };
}, []);

  async function changeStatus(user: AdminUser) {
    const next = user.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    try {
      await apiRequest(`/admin/users/${user.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
      await load();
    } catch { setError('Status user gagal diperbarui.'); }
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-sm text-amber-100">{error}</p>}
      {users.map((user) => (
        <article key={user.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[var(--surface)] p-5 text-sm">
          <div>
            <p className="font-semibold">{user.displayName} <span className="text-[var(--muted)]">· {user.role}</span></p>
            <p className="mt-1 text-[var(--muted)]">{user.email} · {user.status} · 2FA {user.security?.totpEnabled ? 'aktif' : 'nonaktif'}</p>
            <p className="mt-2 text-xs text-[var(--muted)]">{user._count.workers} worker · {user._count.authSessions} sesi · {user._count.apiKeys} API key</p>
          </div>
          {user.role !== 'OWNER' && (
            <button onClick={() => void changeStatus(user)} className="rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/5">
              {user.status === 'SUSPENDED' ? 'Aktifkan' : 'Suspend'}
            </button>
          )}
        </article>
      ))}
    </div>
  );
}
