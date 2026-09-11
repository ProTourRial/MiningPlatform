/** MiningPlatform — Author: Abia Nugrahanto */
'use client';

import type { FormEvent} from 'react';
import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '@/services/api-client';

interface SessionSummary { id: string; createdAt: string; lastUsedAt: string; expiresAt: string; ipHash?: string | null; }
interface MeResponse { security: { totpEnabled: boolean; lastLoginAt?: string | null; passwordChangedAt?: string | null } }
interface GoogleConnection {
  provider: 'GOOGLE';
  enabled: boolean;
  linked: boolean;
  identity?: { email: string; createdAt: string; lastUsedAt?: string | null } | null;
}

export function SecurityManagementPanel() {
  const [me, setMe] = useState<MeResponse>();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [setup, setSetup] = useState<{ secret: string; otpAuthUri: string }>();
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>();
  const [googleConnection, setGoogleConnection] = useState<GoogleConnection>();
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try {
      const [profile, activeSessions, google] = await Promise.all([
        apiRequest<MeResponse>('/users/me'),
        apiRequest<SessionSummary[]>('/users/me/sessions'),
        apiRequest<GoogleConnection>('/auth/google/connection'),
      ]);
      setMe(profile);
      setSessions(activeSessions);
      setGoogleConnection(google);
    } catch {
      setError('Status keamanan tidak dapat dimuat.');
    }
  }, []);

 useEffect(() => {
  let ignore = false;

  void Promise.all([
    apiRequest<MeResponse>('/users/me'),
    apiRequest<SessionSummary[]>('/users/me/sessions'),
    apiRequest<GoogleConnection>('/auth/google/connection'),
  ])
    .then(([profile, activeSessions, google]) => {
      if (ignore) return;

      setMe(profile);
      setSessions(activeSessions);
      setGoogleConnection(google);
    })
    .catch(() => {
      if (!ignore) {
        setError('Status keamanan tidak dapat dimuat.');
      }
    });

  return () => {
    ignore = true;
  };
}, []);

  async function beginSetup() {
    setError(undefined);
    try { setSetup(await apiRequest<{ secret: string; otpAuthUri: string }>('/auth/2fa/setup', { method: 'POST', body: '{}' })); }
    catch { setError('Setup 2FA gagal dimulai.'); }
  }

  async function enable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = new FormData(event.currentTarget).get('code');
    try {
      const result = await apiRequest<{ enabled: boolean; recoveryCodes: string[] }>('/auth/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) });
      setRecoveryCodes(result.recoveryCodes);
      setSetup(undefined);
      await load();
    } catch { setError('Kode TOTP tidak valid.'); }
  }

  async function disable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await apiRequest('/auth/2fa/disable', { method: 'POST', body: JSON.stringify({ password: data.get('password'), code: data.get('code') }) });
      setRecoveryCodes(undefined);
      await load();
    } catch { setError('2FA gagal dinonaktifkan.'); }
  }

  async function revoke(id: string) {
    try {
      await apiRequest(`/users/me/sessions/${id}`, { method: 'DELETE' });
      await load();
    } catch { setError('Sesi gagal dicabut.'); }
  }

  async function changeGoogleLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setGoogleBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const authorization = await apiRequest<{ token: string }>('/auth/step-up', {
        method: 'POST',
        body: JSON.stringify({
          scope: 'EXTERNAL_IDENTITY_LINK',
          password: data.get('password'),
          code: data.get('code'),
        }),
      });
      const headers = { 'x-step-up-token': authorization.token };
      if (googleConnection?.linked) {
        await apiRequest('/auth/google/unlink', { method: 'POST', body: '{}', headers });
        await load();
      } else {
        const result = await apiRequest<{ authorizationUrl: string }>('/auth/google/link/start', {
          method: 'POST',
          body: '{}',
          headers,
        });
        window.location.assign(result.authorizationUrl);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Perubahan tautan Google gagal.');
    } finally {
      setGoogleBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-[var(--surface)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><h2 className="font-semibold">Two-factor authentication</h2><p className="mt-1 text-sm text-[var(--muted)]">Status: {me?.security.totpEnabled ? 'aktif' : 'belum aktif'}</p></div>
          {!me?.security.totpEnabled && <button onClick={() => void beginSetup()} className="rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/5">Mulai setup</button>}
        </div>
        {setup && (
          <form onSubmit={enable} className="mt-5 space-y-3 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm">
            <p>Tambahkan URI berikut ke aplikasi authenticator:</p><p className="break-all font-mono text-xs">{setup.otpAuthUri}</p>
            <input name="code" required pattern="[0-9]{6}" maxLength={6} placeholder="Kode 6 digit" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3" />
            <button className="rounded-xl bg-[var(--accent)] px-4 py-2 font-semibold text-[#04110c]">Aktifkan 2FA</button>
          </form>
        )}
        {recoveryCodes && (
          <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm">
            <p className="font-semibold">Simpan recovery code. Setiap kode hanya dapat dipakai sekali.</p>
            <div className="mt-3 grid gap-2 font-mono text-xs md:grid-cols-2">{recoveryCodes.map((code) => <code key={code}>{code}</code>)}</div>
          </div>
        )}
        {me?.security.totpEnabled && (
          <form onSubmit={disable} className="mt-5 grid gap-3 md:grid-cols-[1fr_180px_auto]">
            <input name="password" type="password" required placeholder="Password saat ini" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3" />
            <input name="code" required pattern="[0-9]{6}" maxLength={6} placeholder="Kode TOTP" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3" />
            <button className="rounded-xl border border-red-300/20 px-4 py-2 text-sm text-red-100 hover:bg-red-300/5">Nonaktifkan</button>
          </form>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-[var(--surface)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Google Sign-In</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {googleConnection?.linked
                ? `Tertaut ke ${googleConnection.identity?.email ?? 'akun Google terverifikasi'}`
                : googleConnection?.enabled
                  ? 'Belum tertaut. Email Google harus sama dengan email akun MiningPlatform.'
                  : 'Belum diaktifkan pada environment deployment ini.'}
            </p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs ${googleConnection?.linked ? 'border-emerald-300/20 bg-emerald-300/5 text-emerald-100' : 'border-white/10 text-[var(--muted)]'}`}>
            {googleConnection?.linked ? 'Tertaut' : 'Tidak tertaut'}
          </span>
        </div>
        {googleConnection?.enabled && me?.security.totpEnabled ? (
          <form onSubmit={changeGoogleLink} className="mt-5 grid gap-3 md:grid-cols-[1fr_180px_auto]">
            <input name="password" type="password" required autoComplete="current-password" placeholder="Password saat ini" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3" />
            <input name="code" required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" placeholder="Kode TOTP" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3" />
            <button disabled={googleBusy} className="rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/5 disabled:opacity-60">
              {googleBusy ? 'Memverifikasi…' : googleConnection.linked ? 'Lepaskan Google' : 'Tautkan Google'}
            </button>
          </form>
        ) : googleConnection?.enabled ? (
          <p className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/5 p-3 text-xs leading-5 text-amber-100">
            Aktifkan 2FA terlebih dahulu. Link dan unlink Google selalu memerlukan password serta TOTP sekali pakai.
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-white/10 bg-[var(--surface)] p-5">
        <h2 className="font-semibold">Sesi aktif</h2>
        <div className="mt-4 space-y-3">{sessions.map((session) => (
          <div key={session.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 p-4 text-sm">
            <div><p className="font-mono text-xs">{session.id}</p><p className="mt-1 text-[var(--muted)]">Terakhir dipakai {new Date(session.lastUsedAt).toLocaleString('id-ID')} · kedaluwarsa {new Date(session.expiresAt).toLocaleDateString('id-ID')}</p></div>
            <button onClick={() => void revoke(session.id)} className="rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/5">Cabut sesi</button>
          </div>
        ))}</div>
      </section>
      {error && <p className="rounded-xl border border-red-300/20 bg-red-300/5 p-3 text-sm text-red-100">{error}</p>}
    </div>
  );
}
