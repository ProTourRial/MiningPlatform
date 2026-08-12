/** MiningPlatform — Author: Abia Nugrahanto */
'use client';

import type { FormEvent} from 'react';
import { useEffect, useState } from 'react';
import { apiRequest } from '@/services/api-client';

interface ProfileResponse {
  email: string;
  displayName: string;
  role: string;
  status: string;
  profile?: { locale?: string; timezone?: string; avatarUrl?: string | null } | null;
  miningAccounts: Array<{ username: string; asset: { symbol: string; algorithm: string }; platformFeePercent: string }>;
}

export function ProfileManagementPanel() {
  const [profile, setProfile] = useState<ProfileResponse>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    void apiRequest<ProfileResponse>('/users/me').then(setProfile).catch(() => setError('Profil tidak dapat dimuat.'));
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(undefined);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    try {
      const updated = await apiRequest<ProfileResponse>('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: data.get('displayName'),
          locale: data.get('locale'),
          timezone: data.get('timezone'),
          avatarUrl: data.get('avatarUrl') || undefined,
        }),
      });
      setProfile(updated);
      setMessage('Profil berhasil diperbarui.');
    } catch {
      setError('Profil gagal diperbarui.');
    }
  }

  if (!profile && !error) return <p className="text-sm text-[var(--muted)]">Memuat profil…</p>;

  return (
    <div className="space-y-6">
      {profile && (
        <form onSubmit={save} className="grid gap-4 rounded-2xl border border-white/10 bg-[var(--surface)] p-5 md:grid-cols-2">
          <label className="text-sm">Nama tampilan<input name="displayName" required minLength={2} defaultValue={profile.displayName} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3" /></label>
          <label className="text-sm">Email<input disabled value={profile.email} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 opacity-70" /></label>
          <label className="text-sm">Bahasa<select name="locale" defaultValue={profile.profile?.locale ?? 'id-ID'} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3"><option value="id-ID">Indonesia</option><option value="en-US">English</option></select></label>
          <label className="text-sm">Timezone<input name="timezone" defaultValue={profile.profile?.timezone ?? 'Asia/Jakarta'} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3" /></label>
          <label className="text-sm md:col-span-2">URL avatar<input name="avatarUrl" type="url" defaultValue={profile.profile?.avatarUrl ?? ''} placeholder="https://..." className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3" /></label>
          <div className="md:col-span-2 flex items-center justify-between gap-4">
            <p className="text-xs text-[var(--muted)]">Role {profile.role} · Status {profile.status}</p>
            <button className="rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-[#04110c]">Simpan profil</button>
          </div>
        </form>
      )}
      {profile?.miningAccounts.map((account) => (
        <article key={account.username} className="rounded-2xl border border-white/10 bg-[var(--surface)] p-5 text-sm">
          <p className="text-[var(--muted)]">Mining account utama</p>
          <p className="mt-2 font-semibold">{account.username}</p>
          <p className="mt-1 text-[var(--muted)]">{account.asset.symbol} / {account.asset.algorithm} · Fee {account.platformFeePercent}%</p>
        </article>
      ))}
      {message && <p className="rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-3 text-sm text-emerald-100">{message}</p>}
      {error && <p className="rounded-xl border border-red-300/20 bg-red-300/5 p-3 text-sm text-red-100">{error}</p>}
    </div>
  );
}
