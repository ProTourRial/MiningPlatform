/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/services/api-client';

interface SessionView {
  id: string;
  current: boolean;
  status: string;
  deviceName?: string;
  deviceType?: string;
  browser?: string;
  operatingSystem?: string;
  countryCode?: string;
  city?: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  revokedAt?: string;
}

interface ProfileSecurity { security: { totpEnabled: boolean; backupCodesRemaining: number }; }

export function SecurityPanel() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionView[]>([]);
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [enrollment, setEnrollment] = useState<{ secret: string; uri: string }>();
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [message, setMessage] = useState('');

  async function load() {
    const [sessionData, profile] = await Promise.all([
      apiFetch<SessionView[]>('/auth/sessions'),
      apiFetch<ProfileSecurity>('/users/me'),
    ]);
    
    setSessions(sessionData);
    setTotpEnabled(profile.security.totpEnabled);
  }

  useEffect(() => {
  let ignore = false;

  void Promise.all([
    apiFetch<SessionView[]>('/auth/sessions'),
    apiFetch<ProfileSecurity>('/users/me'),
  ])
    .then(([sessionData, profile]) => {
      if (ignore) return;

      setSessions(sessionData);
      setTotpEnabled(profile.security.totpEnabled);
    })
    .catch((error) => {
      if (!ignore) {
        setMessage(
          error instanceof Error
            ? error.message
            : 'Status keamanan gagal dimuat',
        );
      }
    });

  return () => {
    ignore = true;
  };
}, []);

  async function setupTotp() {
    try { setEnrollment(await apiFetch('/auth/2fa/setup', { method: 'POST', body: '{}' })); setMessage('Tambahkan secret ke aplikasi authenticator, lalu masukkan kode enam digit.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Setup 2FA gagal'); }
  }

  async function enableTotp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = new FormData(event.currentTarget).get('code');
    try {
      const result = await apiFetch<{ enabled: boolean; backupCodes: string[] }>('/auth/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) });
      setTotpEnabled(result.enabled);
      setBackupCodes(result.backupCodes);
      setEnrollment(undefined);
      setMessage('2FA aktif. Simpan backup code di tempat terpisah.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Aktivasi 2FA gagal'); }
  }

  async function disableTotp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await apiFetch('/auth/2fa/disable', { method: 'POST', body: JSON.stringify({ password: data.get('password'), code: data.get('code') }) });
      setTotpEnabled(false);
      setBackupCodes([]);
      setMessage('2FA dinonaktifkan.');
      event.currentTarget.reset();
    } catch (error) { setMessage(error instanceof Error ? error.message : '2FA gagal dinonaktifkan'); }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await apiFetch('/auth/password/change', { method: 'POST', body: JSON.stringify({ currentPassword: data.get('currentPassword'), newPassword: data.get('newPassword') }) });
      router.replace('/login');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Password gagal diubah'); }
  }

  async function revokeSession(session: SessionView) {
    await apiFetch(`/auth/sessions/${session.id}`, { method: 'DELETE', body: JSON.stringify({ reason: 'USER_REQUEST' }) });
    if (session.current) { router.replace('/login'); return; }
    await load();
  }

  async function revokeAll() {
    if (!window.confirm('Keluar dari seluruh perangkat?')) return;
    await apiFetch('/auth/sessions/all', { method: 'DELETE' });
    router.replace('/login');
  }

  return <div className="space-y-6">
    {message && <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">{message}</p>}
    <section className="rounded-2xl border border-white/10 bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Two-Factor Authentication</h2><p className="mt-1 text-sm text-[var(--muted)]">TOTP dan backup code satu kali pakai.</p></div><span className={`rounded-full border px-3 py-1 text-xs ${totpEnabled ? 'border-emerald-300/20 text-emerald-100' : 'border-amber-300/20 text-amber-100'}`}>{totpEnabled ? 'ENABLED' : 'DISABLED'}</span></div>
      {!totpEnabled && !enrollment && <button onClick={setupTotp} className="mt-5 rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-[#04110c]">Setup 2FA</button>}
      {enrollment && <div className="mt-5 space-y-4 rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-4"><p className="text-sm">Secret authenticator</p><code className="block break-all text-xs">{enrollment.secret}</code><p className="break-all text-xs text-[var(--muted)]">{enrollment.uri}</p><form onSubmit={enableTotp} className="flex flex-wrap gap-3"><input name="code" required pattern="[0-9]{6}" placeholder="123456" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 font-mono" /><button className="rounded-xl border border-cyan-300/20 px-4 py-3 text-sm text-cyan-100">Aktifkan</button></form></div>}
      {backupCodes.length > 0 && <div className="mt-5 rounded-xl border border-amber-300/30 bg-amber-300/5 p-4"><p className="text-sm text-amber-100">Backup code hanya ditampilkan sekali.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{backupCodes.map((code) => <code key={code} className="rounded-lg border border-white/10 p-2 text-center text-xs">{code}</code>)}</div></div>}
      {totpEnabled && <form onSubmit={disableTotp} className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_auto]"><input name="password" type="password" required placeholder="Password" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3" /><input name="code" required placeholder="TOTP / backup code" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 font-mono" /><button className="rounded-xl border border-red-300/20 px-4 py-3 text-sm text-red-100">Nonaktifkan</button></form>}
    </section>

    <section className="rounded-2xl border border-white/10 bg-[var(--surface)] p-5"><h2 className="font-semibold">Change Password</h2><form onSubmit={changePassword} className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]"><input name="currentPassword" type="password" required placeholder="Password saat ini" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3" /><input name="newPassword" type="password" required minLength={12} placeholder="Password baru" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3" /><button className="rounded-xl border border-white/10 px-4 py-3 text-sm">Ubah dan logout semua</button></form></section>

    <section className="rounded-2xl border border-white/10 bg-[var(--surface)] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Sessions</h2><p className="mt-1 text-sm text-[var(--muted)]">Perangkat, browser, lokasi indikatif, dan aktivitas terakhir.</p></div><button onClick={revokeAll} className="rounded-xl border border-red-300/20 px-4 py-2 text-sm text-red-100">Logout semua perangkat</button></div><div className="mt-5 grid gap-3">{sessions.map((session) => <article key={session.id} className="grid gap-3 rounded-xl border border-white/10 p-4 md:grid-cols-[1fr_auto]"><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{session.deviceName ?? 'Unknown device'}</p>{session.current && <span className="rounded-full border border-emerald-300/20 px-2 py-0.5 text-[10px] text-emerald-100">CURRENT</span>}<span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px]">{session.status}</span></div><p className="mt-2 text-xs text-[var(--muted)]">{session.city ?? 'Unknown city'} {session.countryCode ? `· ${session.countryCode}` : ''} · aktif {new Date(session.lastActiveAt).toLocaleString('id-ID')} · kedaluwarsa {new Date(session.expiresAt).toLocaleString('id-ID')}</p></div>{session.status === 'ACTIVE' && <button onClick={() => revokeSession(session)} className="rounded-lg border border-white/10 px-3 py-2 text-xs">Logout device</button>}</article>)}</div></section>
  </div>;
}
