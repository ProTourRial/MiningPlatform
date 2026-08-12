/** MiningPlatform — Author: Abia Nugrahanto */
'use client';

import Link from 'next/link';
import type { FormEvent} from 'react';
import { useState } from 'react';
import { AuthCard } from '@/components/ui/auth-card';
import { API_BASE_URL } from '@/services/api-client';


export default function RegisterPage() {
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    setMessage(undefined);
    const data = new FormData(event.currentTarget);
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        displayName: data.get('displayName'),
        email: data.get('email'),
        password: data.get('password'),
        miningUsername: data.get('miningUsername'),
      }),
    }).catch(() => undefined);
    setSubmitting(false);
    if (!response?.ok) {
      setError(response ? 'Registrasi gagal. Periksa email, password, dan username mining.' : 'API tidak dapat dihubungi.');
      return;
    }
    const result = await response.json() as { verificationToken?: string };
    if (result.verificationToken) {
      setMessage(`Akun dibuat. Token verifikasi development: ${result.verificationToken} | Buka /verify-email untuk mengaktifkan akun.`);
    } else {
      setMessage('Akun dibuat. Periksa kanal email yang dikonfigurasi untuk verifikasi.');
    }
  }

  return (
    <AuthCard title="Buat akun" description="Akun Control Plane digunakan untuk mendaftarkan worker dan memantau share.">
      <form className="space-y-4" onSubmit={submit}>
        <label className="block text-sm">Nama<input name="displayName" required minLength={2} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-[var(--accent)]" /></label>
        <label className="block text-sm">Email<input name="email" required type="email" autoComplete="email" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-[var(--accent)]" /></label>
        <label className="block text-sm">Username mining<input name="miningUsername" required pattern="[a-z0-9_-]{3,32}" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-[var(--accent)]" /></label>
        <label className="block text-sm">Password<input name="password" required type="password" minLength={12} autoComplete="new-password" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-[var(--accent)]" /></label>
        <p className="text-xs leading-5 text-[var(--muted)]">Minimal 12 karakter dan harus memuat huruf besar, huruf kecil, serta angka.</p>
        <button disabled={submitting} className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-[#04110c] disabled:opacity-50">{submitting ? 'Memproses…' : 'Daftar'}</button>
      </form>
      {error && <p className="mt-4 rounded-xl border border-red-300/20 bg-red-300/5 p-3 text-sm text-red-100">{error}</p>}
      {message && <p className="mt-4 break-words rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-3 text-sm text-emerald-100">{message}</p>}
      <p className="mt-5 text-sm text-[var(--muted)]">Sudah punya akun? <Link href="/login" className="text-white">Masuk</Link></p>
    </AuthCard>
  );
}
