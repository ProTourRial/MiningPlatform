/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

'use client';

import type { FormEvent} from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/services/api-client';

interface RegisterResponse { verificationRequired: boolean; developmentToken?: string; }

export function RegisterForm() {
  const [message, setMessage] = useState('');
  const [token, setToken] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    const data = new FormData(event.currentTarget);
    try {
      const result = await apiFetch<RegisterResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ displayName: data.get('displayName'), email: data.get('email'), password: data.get('password'), accountType: data.get('accountType') }),
      }, false);
      setMessage('Akun dibuat. Verifikasi email sebelum login.');
      setToken(result.developmentToken);
      event.currentTarget.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Registrasi gagal');
    } finally { setSubmitting(false); }
  }
  return (
    <form className="space-y-4" onSubmit={submit}>
      <label className="block text-sm">Nama<input name="displayName" required minLength={2} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-[var(--accent)]" /></label>
      <label className="block text-sm">Email<input name="email" required type="email" autoComplete="email" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-[var(--accent)]" /></label>
      <label className="block text-sm">Password<input name="password" required type="password" minLength={12} autoComplete="new-password" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-[var(--accent)]" /><span className="mt-1 block text-xs text-[var(--muted)]">Minimal 12 karakter, huruf besar, huruf kecil, dan angka.</span></label>
      <label className="block text-sm">Jenis akun<select name="accountType" className="mt-2 w-full rounded-xl border border-white/10 bg-[#08120f] px-4 py-3"><option value="INDIVIDUAL">Individu</option><option value="COMPANY">Perusahaan</option></select></label>
      <button disabled={submitting} className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-[#04110c] disabled:opacity-60">{submitting ? 'Membuat akun…' : 'Buat akun'}</button>
      {message && <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs leading-6">{message}</p>}
      {token && <Link className="block rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-3 text-xs text-cyan-100" href={`/verify-email?token=${encodeURIComponent(token)}`}>Development: buka verifikasi email</Link>}
      <p className="text-sm text-[var(--muted)]">Sudah punya akun? <Link href="/login" className="text-white">Masuk</Link></p>
    </form>
  );
}
