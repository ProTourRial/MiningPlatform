/** MiningPlatform — Author: Abia Nugrahanto */
'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { FormEvent} from 'react';
import { Suspense, useState } from 'react';
import { AuthCard } from '@/components/ui/auth-card';
import { API_BASE_URL } from '@/services/api-client';


function ResetPasswordForm() {
  const search = useSearchParams();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const response = await fetch(`${API_BASE_URL}/auth/reset-password`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: data.get('token'), password: data.get('password') }) }).catch(() => undefined);
    if (!response?.ok) { setError('Token tidak valid atau password tidak memenuhi kebijakan.'); return; }
    setError(undefined); setMessage('Password berhasil diubah. Semua sesi lama telah dicabut.');
  }
  return <AuthCard title="Buat password baru" description="Minimal 12 karakter dengan huruf besar, huruf kecil, dan angka."><form onSubmit={submit} className="space-y-4"><textarea name="token" required minLength={20} defaultValue={search.get('token') ?? ''} className="min-h-24 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3" /><input name="password" required type="password" minLength={12} autoComplete="new-password" placeholder="Password baru" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3" /><button className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-[#04110c]">Ubah password</button></form>{message && <p className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-3 text-sm text-emerald-100">{message}</p>}{error && <p className="mt-4 rounded-xl border border-red-300/20 bg-red-300/5 p-3 text-sm text-red-100">{error}</p>}<p className="mt-5 text-sm"><Link href="/login" className="text-white">Kembali ke login</Link></p></AuthCard>;
}

export default function ResetPasswordPage() { return <Suspense fallback={<p>Memuat…</p>}><ResetPasswordForm /></Suspense>; }
