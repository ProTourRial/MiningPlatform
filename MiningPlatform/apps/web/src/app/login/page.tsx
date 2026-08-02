/** MiningPlatform — Author: Abia Nugrahanto */
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { AuthCard } from '@/components/ui/auth-card';
import { API_BASE_URL } from '@/services/api-client';


export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: data.get('email'),
        password: data.get('password'),
        totpCode: data.get('totpCode') || undefined,
        recoveryCode: data.get('recoveryCode') || undefined,
      }),
    }).catch(() => undefined);
    setSubmitting(false);
    if (!response?.ok) {
      setError(response ? 'Email, password, atau kode 2FA tidak valid.' : 'API tidak dapat dihubungi.');
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <AuthCard title="Masuk" description="Gunakan akun Control Plane MiningPlatform.">
      <form className="space-y-4" onSubmit={submit}>
        <label className="block text-sm">Email<input name="email" required type="email" autoComplete="email" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-[var(--accent)]" /></label>
        <label className="block text-sm">Password<input name="password" required type="password" autoComplete="current-password" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-[var(--accent)]" /></label>
        <label className="block text-sm">Kode 2FA <span className="text-[var(--muted)]">(bila aktif)</span><input name="totpCode" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-[var(--accent)]" /></label>
        <label className="block text-sm">Recovery code <span className="text-[var(--muted)]">(alternatif satu kali)</span><input name="recoveryCode" autoComplete="one-time-code" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-[var(--accent)]" /></label>
        <button disabled={submitting} className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-[#04110c] disabled:opacity-50">{submitting ? 'Memproses…' : 'Masuk'}</button>
      </form>
      {error && <p className="mt-4 rounded-xl border border-red-300/20 bg-red-300/5 p-3 text-sm text-red-100">{error}</p>}
      <p className="mt-5 text-sm text-[var(--muted)]">Belum punya akun? <Link href="/register" className="text-white">Daftar</Link> · <Link href="/forgot-password" className="text-white">Lupa password</Link></p>
    </AuthCard>
  );
}
