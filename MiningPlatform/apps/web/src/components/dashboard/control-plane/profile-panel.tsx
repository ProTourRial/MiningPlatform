/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiFetch } from '@/services/api-client';

interface ProfileView {
  id: string;
  email: string;
  displayName: string;
  status: string;
  accountType: string;
  emailVerified: boolean;
  locale: string;
  timezone: string;
  roles: string[];
  security: { totpEnabled: boolean; backupCodesRemaining: number; passwordChangedAt?: string };
  createdAt: string;
}

export function ProfilePanel() {
  const [profile, setProfile] = useState<ProfileView>();
  const [message, setMessage] = useState('');
  async function load() { 
    setProfile(await apiFetch<ProfileView>('/users/me')); 
  }

  useEffect(() => {
  let ignore = false;

  void apiFetch<ProfileView>('/users/me')
    .then((result) => {
      if (!ignore) {
        setProfile(result);
      }
    })
    .catch((error) => {
      if (!ignore) {
        setMessage(
          error instanceof Error
            ? error.message
            : 'Profil gagal dimuat',
        );
      }
    });

  return () => {
    ignore = true;
  };
}, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await apiFetch('/users/me', { method: 'PATCH', body: JSON.stringify({ displayName: data.get('displayName'), locale: data.get('locale'), timezone: data.get('timezone'), accountType: data.get('accountType') }) });
      setMessage('Profil diperbarui.');
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Profil gagal diperbarui'); }
  }
  if (!profile) return <p className="text-sm text-[var(--muted)]">Memuat profil…</p>;
  return <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-white/10 bg-[var(--surface)] p-5">
      <label className="block text-sm">Nama<input name="displayName" defaultValue={profile.displayName} required className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3" /></label>
      <label className="block text-sm">Email<input value={profile.email} disabled className="mt-2 w-full rounded-xl border border-white/10 bg-black/10 px-4 py-3 text-[var(--muted)]" /></label>
      <div className="grid gap-4 md:grid-cols-2"><label className="block text-sm">Locale<input name="locale" defaultValue={profile.locale} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3" /></label><label className="block text-sm">Timezone<input name="timezone" defaultValue={profile.timezone} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3" /></label></div>
      <label className="block text-sm">Jenis akun<select name="accountType" defaultValue={profile.accountType} className="mt-2 w-full rounded-xl border border-white/10 bg-[#08120f] px-4 py-3"><option value="INDIVIDUAL">Individu</option><option value="COMPANY">Perusahaan</option></select></label>
      <button className="rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-[#04110c]">Simpan profil</button>
      {message && <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">{message}</p>}
    </form>
    <aside className="space-y-4 rounded-2xl border border-white/10 bg-[var(--surface)] p-5"><h2 className="font-semibold">Account Summary</h2>{[
      ['Status', profile.status], ['Email verified', profile.emailVerified ? 'Yes' : 'No'], ['Roles', profile.roles.join(', ')], ['2FA', profile.security.totpEnabled ? 'Enabled' : 'Disabled'], ['Backup codes', String(profile.security.backupCodesRemaining)], ['Created', new Date(profile.createdAt).toLocaleString('id-ID')],
    ].map(([label, value]) => <div key={label} className="flex justify-between gap-4 border-b border-white/10 pb-3 text-sm"><span className="text-[var(--muted)]">{label}</span><span className="text-right">{value}</span></div>)}</aside>
  </div>;
}
