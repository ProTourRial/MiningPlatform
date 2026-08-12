/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

'use client';

import type { Route } from 'next';
import { ArrowRight, KeyRound, LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { FormEvent} from 'react';
import { useState } from 'react';
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
          recoveryCode: data.get('recoveryCode') || undefined,
        }),
      }, false);

      const requestedNext = search.get('next');
      const destination = requestedNext && requestedNext.startsWith('/') && !requestedNext.startsWith('//')
        ? requestedNext
        : '/dashboard';
      router.push(destination as Route);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && JSON.stringify(error.payload).includes('TWO_FACTOR_REQUIRED')) {
        setTwoFactorRequired(true);
        setMessage('Akun ini dilindungi 2FA. Masukkan kode authenticator atau recovery code.');
      } else {
        setMessage(error instanceof Error ? error.message : 'Login gagal. Periksa kredensial dan coba kembali.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <label className="block text-xs font-semibold text-[#c9d5dd]">Email<input name="email" required type="email" autoComplete="email" placeholder="operator@example.com" className="mt-2.5 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3.5 text-sm outline-none transition placeholder:text-[#50687a] focus:border-[var(--accent)]/55" /></label>
      <label className="block text-xs font-semibold text-[#c9d5dd]">Password<input name="password" required type="password" autoComplete="current-password" placeholder="Masukkan password" className="mt-2.5 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3.5 text-sm outline-none transition placeholder:text-[#50687a] focus:border-[var(--accent)]/55" /></label>
      {twoFactorRequired ? (
        <div className="space-y-3 rounded-2xl border border-amber-300/15 bg-amber-300/[0.035] p-4">
          <label className="block text-xs font-semibold text-[#c9d5dd]">Kode authenticator<div className="relative mt-2.5"><KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-[#61798b]" size={15} /><input name="totpCode" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" className="w-full rounded-xl border border-white/10 bg-black/20 py-3 pl-11 pr-4 font-mono text-sm outline-none transition focus:border-[var(--accent)]/55" /></div></label>
          <label className="block text-xs font-semibold text-[#c9d5dd]">Atau recovery code<input name="recoveryCode" autoComplete="one-time-code" className="mt-2.5 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 font-mono text-sm outline-none transition focus:border-[var(--accent)]/55" /></label>
        </div>
      ) : null}
      <button disabled={submitting} className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3.5 text-sm font-bold text-[#04110c] transition hover:bg-[#e3ff91] disabled:opacity-60">{submitting ? <><LoaderCircle size={16} className="animate-spin" /> Memverifikasi…</> : <>Masuk ke workspace <ArrowRight size={16} className="transition group-hover:translate-x-0.5" /></>}</button>
      {message ? <p className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-xs leading-6 text-amber-100">{message}</p> : null}
      <div className="flex flex-wrap justify-between gap-3 border-t border-white/8 pt-4 text-xs text-[var(--muted)]"><Link href="/forgot-password" className="transition hover:text-white">Lupa password?</Link><Link href="/register" className="font-semibold text-white transition hover:text-[var(--accent)]">Buat akun</Link></div>
    </form>
  );
}
