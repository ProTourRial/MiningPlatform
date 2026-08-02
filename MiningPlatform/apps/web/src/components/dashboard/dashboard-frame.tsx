/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/services/api-client';

const menu = [
  ['Overview', '/dashboard'],
  ['Workers', '/dashboard/workers'],
  ['Hashrate', '/dashboard/hashrate'],
  ['Rewards', '/dashboard/rewards'],
  ['Wallet', '/dashboard/wallet'],
  ['Profile', '/dashboard/profile'],
  ['Security', '/dashboard/security'],
  ['Settings', '/dashboard/settings'],
  ['API', '/dashboard/api'],
  ['Audit', '/dashboard/audit'],
] as const;

interface Profile { displayName: string; email: string; roles: string[]; }

export function DashboardFrame({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<Profile>();
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiFetch<Profile>('/users/me')
      .then(setProfile)
      .catch(() => router.replace(`/login?next=${encodeURIComponent(pathname)}`))
      .finally(() => setLoading(false));
  }, [pathname, router]);

  async function logout() {
    try { await apiFetch('/auth/logout', { method: 'POST' }); } finally { router.replace('/login'); router.refresh(); }
  }

  if (loading) return <main className="grid min-h-screen place-items-center text-sm text-[var(--muted)]">Memverifikasi session…</main>;
  if (!profile) return null;

  return (
    <div className="grid min-h-screen lg:grid-cols-[250px_1fr]">
      <aside className="border-r border-white/10 bg-[var(--surface)] p-5 lg:min-h-screen">
        <Link href="/" className="text-lg font-semibold">MiningPlatform</Link>
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/15 p-3">
          <p className="truncate text-sm font-medium">{profile.displayName}</p>
          <p className="truncate text-xs text-[var(--muted)]">{profile.email}</p>
          <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-[var(--accent)]">{profile.roles.join(' · ')}</p>
        </div>
        <nav className="mt-6 grid gap-1">
          {menu.map(([label, href]) => <Link key={href} href={href} className={`rounded-lg px-3 py-2 text-sm ${pathname === href ? 'bg-white/10 text-white' : 'text-[var(--muted)] hover:bg-white/5 hover:text-white'}`}>{label}</Link>)}
        </nav>
        <button onClick={logout} className="mt-8 w-full rounded-xl border border-white/10 px-3 py-2 text-left text-sm text-[var(--muted)] hover:border-red-300/30 hover:text-red-100">Keluar dari session</button>
      </aside>
      <div>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
          <p className="text-sm text-[var(--muted)]">BTC · SHA-256 · FOLLOW_UPSTREAM</p>
          <span className="rounded-full border border-emerald-300/20 bg-emerald-300/5 px-3 py-1 text-xs text-emerald-100">IDENTITY & ACCESS</span>
        </header>
        <main className="p-6 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
