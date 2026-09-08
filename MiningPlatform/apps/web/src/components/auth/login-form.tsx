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
import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch, ApiError, API_BASE_URL } from '@/services/api-client';

interface AuthStatus {
  oauth?: { google?: { enabled: boolean; signIn: boolean; signUp: boolean } };
}

function oauthMessage(result: string | null): string {
  if (result === 'not_linked') {
    return 'Akun Google ini belum ditautkan. Masuk dengan password, aktifkan 2FA, lalu tautkan Google dari halaman Security.';
  }
  if (result === 'cancelled') {
    return 'Google Sign-In dibatalkan. Tidak ada perubahan pada akun Anda.';
  }
  if (result === 'failed') {
    return 'Google Sign-In gagal atau sudah kedaluwarsa. Mulai kembali dari halaman ini.';
  }
  return '';
}

export function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [message, setMessage] = useState(() => oauthMessage(search.get('oauth')));
  const [submitting, setSubmitting] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  const destination = useMemo(() => {
    const requestedNext = search.get('next');
    return requestedNext && requestedNext.startsWith('/') && !requestedNext.startsWith('//')
      ? requestedNext
      : '/dashboard';
  }, [search]);

  useEffect(() => {
    let active = true;
    void apiFetch<AuthStatus>('/auth/status', undefined, false)
      .then((status) => {
        if (active) setGoogleEnabled(status.oauth?.google?.enabled === true);
      })
      .catch(() => {
        if (active) setGoogleEnabled(false);
      });

    return () => {
      active = false;
    };
  }, [search]);

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
      {googleEnabled ? (
        <>
          <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
            <span className="h-px flex-1 bg-white/8" />atau<span className="h-px flex-1 bg-white/8" />
          </div>
          <a
            href={`${API_BASE_URL}/auth/google/start?next=${encodeURIComponent(destination)}`}
            className="inline-flex w-full items-center justify-center gap-3 rounded-xl border border-white/12 bg-white/[0.035] px-4 py-3.5 text-sm font-semibold text-white transition hover:border-white/25 hover:bg-white/[0.07]"
          >
            <span aria-hidden="true" className="grid h-5 w-5 place-items-center rounded-full bg-white text-xs font-bold text-[#4285f4]">G</span>
            Lanjutkan dengan Google
          </a>
          <p className="text-center text-[11px] leading-5 text-[var(--muted)]">
            Hanya untuk akun yang sudah ditautkan dari halaman Security.
          </p>
        </>
      ) : null}
      {message ? <p className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-xs leading-6 text-amber-100">{message}</p> : null}
      <div className="flex flex-wrap justify-between gap-3 border-t border-white/8 pt-4 text-xs text-[var(--muted)]"><Link href="/forgot-password" className="transition hover:text-white">Lupa password?</Link><Link href="/register" className="font-semibold text-white transition hover:text-[var(--accent)]">Buat akun</Link></div>
    </form>
  );
}
