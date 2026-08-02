/** MiningPlatform — Author: Abia Nugrahanto */
'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { AuthCard } from '@/components/ui/auth-card';
import { API_BASE_URL } from '@/services/api-client';


export default function ForgotPasswordPage() {
  const [message, setMessage] = useState<string>();
  const [resetToken, setResetToken] = useState<string>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get('email');
    const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) }).catch(() => undefined);
    if (!response?.ok) { setMessage('Permintaan tidak dapat diproses.'); return; }
    const result = await response.json() as { resetToken?: string };
    setResetToken(result.resetToken);
    setMessage('Bila akun tersedia, permintaan reset telah dibuat.');
  }
  return <AuthCard title="Reset password" description="Permintaan selalu dijawab netral untuk mencegah enumerasi akun."><form onSubmit={submit} className="space-y-4"><input name="email" required type="email" autoComplete="email" placeholder="Email" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3" /><button className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-[#04110c]">Kirim permintaan</button></form>{message && <p className="mt-4 rounded-xl border border-white/10 p-3 text-sm text-[var(--muted)]">{message}</p>}{resetToken && <p className="mt-4 break-all rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-sm text-amber-100">Token development: {resetToken}<br /><Link href={`/reset-password?token=${encodeURIComponent(resetToken)}`} className="underline">Lanjutkan reset</Link></p>}<p className="mt-5 text-sm"><Link href="/login" className="text-white">Kembali ke login</Link></p></AuthCard>;
}
