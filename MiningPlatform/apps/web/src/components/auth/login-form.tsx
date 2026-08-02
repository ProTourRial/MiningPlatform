/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

'use client';

import { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/services/api-client';

export function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    const data = new FormData(event.currentTarget);
    try {
      await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: data.get('email'),
          password: data.get('password'),
          totpCode: data.get('totpCode') || undefined,
        }),
      }, false);
      router.push(search.get('next') || '/dashboard');
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && JSON.stringify(error.payload).includes('TWO_FACTOR_REQUIRED')) {
        setTwoFactorRequired(true);
        setMessage('Masukkan kode authenticator atau backup code.');
      } else {
        setMessage(error instanceof Error ? error.message : 'Login gagal');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <label className="block text-sm">Email<input name="email" required type="email" autoComplete="email" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-[var(--accent)]" /></label>
      <label className="block text-sm">Password<input name="password" required type="password" autoComplete="current-password" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-[var(--accent)]" /></label>
      {twoFactorRequired && <label className="block text-sm">Kode 2FA / Backup Code<input name="totpCode" required className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 font-mono outline-none focus:border-[var(--accent)]" /></label>}
      <button disabled={submitting} className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-[#04110c] disabled:opacity-60">{submitting ? 'Memverifikasi…' : 'Masuk'}</button>
      {message && <p className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-xs leading-6 text-amber-100">{message}</p>}
      <div className="flex justify-between text-sm text-[var(--muted)]"><Link href="/forgot-password" className="text-white">Lupa password?</Link><Link href="/register" className="text-white">Buat akun</Link></div>
    </form>
  );
}
