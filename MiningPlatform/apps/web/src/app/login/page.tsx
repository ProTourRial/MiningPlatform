/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import Link from 'next/link';
import { AuthCard } from '@/components/ui/auth-card';

export default function LoginPage() {
  return (
    <AuthCard title="Masuk" description="Autentikasi API akan dihubungkan pada tahap integrasi auth.">
      <form className="space-y-4" aria-describedby="auth-status">
        <label className="block text-sm">
          Email
          <input type="email" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-[var(--accent)]" />
        </label>
        <label className="block text-sm">
          Password
          <input type="password" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-[var(--accent)]" />
        </label>
        <button type="button" disabled className="w-full cursor-not-allowed rounded-xl bg-[var(--accent)]/50 px-4 py-3 font-semibold text-[#04110c]/70">Masuk belum aktif</button>
      </form>
      <p id="auth-status" className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-xs leading-6 text-amber-100">Form ini hanya pratinjau UI. API autentikasi dan session pengguna belum diaktifkan.</p>
      <p className="mt-5 text-sm text-[var(--muted)]">Belum punya akun? <Link href="/register" className="text-white">Daftar</Link></p>
    </AuthCard>
  );
}
