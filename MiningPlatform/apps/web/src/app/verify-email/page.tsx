/** MiningPlatform — Author: Abia Nugrahanto */
'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { FormEvent} from 'react';
import { Suspense, useState } from 'react';
import { AuthCard } from '@/components/ui/auth-card';
import { API_BASE_URL } from '@/services/api-client';


function VerifyEmailForm() {
  const search = useSearchParams();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const response = await fetch(`${API_BASE_URL}/auth/verify-email`, {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: data.get('token') }),
    }).catch(() => undefined);
    if (!response?.ok) { setError('Token verifikasi tidak valid atau sudah kedaluwarsa.'); return; }
    setError(undefined); setMessage('Email berhasil diverifikasi. Akun sudah dapat digunakan untuk login.');
  }

  return <AuthCard title="Verifikasi email" description="Masukkan token yang dikirim melalui kanal verifikasi."><form onSubmit={verify} className="space-y-4"><textarea name="token" required minLength={20} defaultValue={search.get('token') ?? ''} className="min-h-28 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3" /><button className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-[#04110c]">Verifikasi</button></form>{message && <p className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-3 text-sm text-emerald-100">{message}</p>}{error && <p className="mt-4 rounded-xl border border-red-300/20 bg-red-300/5 p-3 text-sm text-red-100">{error}</p>}<p className="mt-5 text-sm text-[var(--muted)]"><Link href="/login" className="text-white">Kembali ke login</Link></p></AuthCard>;
}

export default function VerifyEmailPage() { return <Suspense fallback={<p>Memuat…</p>}><VerifyEmailForm /></Suspense>; }
