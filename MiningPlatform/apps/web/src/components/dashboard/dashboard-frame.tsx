/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Route } from 'next';
import {
  Activity,
  BellRing,
  ChevronRight,
  CircleUserRound,
  Coins,
  FileClock,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  Settings,
  ShieldCheck,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '@/services/api-client';
import { useUiStore } from '@/store/ui-store';

type NavigationItem = {
  label: string;
  href: Route;
  icon: LucideIcon;
  gated?: boolean;
  roles?: string[];
};

const navigationGroups: Array<{ label: string; items: NavigationItem[] }> = [
  {
    label: 'Mining operations',
    items: [
      { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Workers', href: '/dashboard/workers', icon: UsersRound },
      { label: 'Hashrate', href: '/dashboard/hashrate', icon: Gauge },
    ],
  },
  {
    label: 'Accounting',
    items: [
      { label: 'Rewards', href: '/dashboard/rewards', icon: Coins, gated: true },
      { label: 'Wallet', href: '/dashboard/wallet', icon: WalletCards, gated: true },
    ],
  },
  {
    label: 'Control plane',
    items: [
      { label: 'Profile', href: '/dashboard/profile', icon: CircleUserRound },
      { label: 'Security', href: '/dashboard/security', icon: ShieldCheck },
      { label: 'Notifications', href: '/dashboard/settings', icon: BellRing },
      { label: 'API access', href: '/dashboard/api', icon: KeyRound },
      { label: 'Audit log', href: '/dashboard/audit', icon: FileClock },
      { label: 'Administration', href: '/dashboard/admin', icon: Settings, roles: ['ADMIN', 'OWNER'] },
    ],
  },
];

interface Profile {
  displayName: string;
  email: string;
  role: string;
  status: string;
  security?: { totpEnabled: boolean } | null;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function DashboardFrame({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { sidebarOpen, setSidebarOpen } = useUiStore();
  const [profile, setProfile] = useState<Profile>();
  const [loading, setLoading] = useState(true);

  const currentItem = useMemo(
    () => navigationGroups.flatMap((group) => group.items).find((item) => item.href === pathname),
    [pathname],
  );

  useEffect(() => {
    let active = true;

    void apiRequest<Profile>('/users/me')
      .then((value) => {
        if (active) setProfile(value);
      })
      .catch(() => {
        if (active) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [pathname, router]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname, setSidebarOpen]);

  async function logout() {
    try {
      await apiRequest('/auth/logout', { method: 'POST', body: '{}' });
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--background)] px-6">
        <div className="text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-[var(--accent)]/25 bg-[var(--accent)]/10 text-[var(--accent)]">
            <Network className="animate-pulse" size={22} />
          </span>
          <p className="mono-font mt-4 text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">Memverifikasi control plane</p>
        </div>
      </main>
    );
  }

  if (!profile) return null;

  const role = profile.role.toUpperCase();

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-20 items-center justify-between border-b border-white/8 px-5">
        <Link href="/" className="group flex items-center gap-3" aria-label="MiningPlatform homepage">
          <span className="grid size-10 place-items-center rounded-xl border border-[var(--accent)]/25 bg-[var(--accent)]/10 text-[var(--accent)] transition group-hover:border-[var(--accent)]/50">
            <Network size={19} strokeWidth={2.2} />
          </span>
          <span>
            <span className="display-font block text-base font-bold tracking-[-0.03em]">MiningPlatform</span>
            <span className="mono-font mt-0.5 block text-[8px] uppercase tracking-[0.2em] text-[var(--muted)]">Operations control plane</span>
          </span>
        </Link>
        <button type="button" onClick={() => setSidebarOpen(false)} className="grid size-9 place-items-center rounded-lg border border-white/10 text-[var(--muted)] lg:hidden" aria-label="Tutup navigasi">
          <X size={18} />
        </button>
      </div>

      <nav className="dashboard-scrollbar flex-1 overflow-y-auto px-3 py-5" aria-label="Dashboard navigation">
        {navigationGroups.map((group) => {
          const visibleItems = group.items.filter((item) => !item.roles || item.roles.includes(role));
          if (!visibleItems.length) return null;

          return (
            <div key={group.label} className="mb-6 last:mb-0">
              <p className="mono-font mb-2 px-3 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#647b8e]">{group.label}</p>
              <div className="grid gap-1">
                {visibleItems.map((item) => {
                  const active = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${
                        active
                          ? 'border-[var(--accent)]/20 bg-[var(--accent)]/10 text-white'
                          : 'border-transparent text-[#9db0bf] hover:border-white/8 hover:bg-white/[0.035] hover:text-white'
                      }`}
                    >
                      <Icon size={17} className={active ? 'text-[var(--accent)]' : 'text-[#70879a] transition group-hover:text-[#a9bdcb]'} />
                      <span className="flex-1 font-medium">{item.label}</span>
                      {item.gated ? <span className="mono-font rounded border border-amber-300/15 px-1.5 py-0.5 text-[7px] uppercase tracking-[0.12em] text-amber-200/75">Gated</span> : null}
                      {active ? <ChevronRight size={14} className="text-[var(--accent)]" /> : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/8 p-3">
        <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#98f5ff]/10 text-xs font-bold text-[#98f5ff]">{initials(profile.displayName) || 'MP'}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{profile.displayName}</p>
              <p className="truncate text-[11px] text-[var(--muted)]">{profile.email}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-white/8 pt-3">
            <div className="flex items-center gap-2">
              <span className="mono-font rounded-full border border-[#98f5ff]/20 bg-[#98f5ff]/8 px-2 py-1 text-[8px] font-bold uppercase tracking-[0.13em] text-[#98f5ff]">{role}</span>
              <span className={`size-1.5 rounded-full ${profile.security?.totpEnabled ? 'bg-emerald-300' : 'bg-amber-300'}`} title={profile.security?.totpEnabled ? '2FA aktif' : '2FA belum aktif'} />
            </div>
            <button type="button" onClick={() => void logout()} className="grid size-8 place-items-center rounded-lg text-[#8297a8] transition hover:bg-red-300/8 hover:text-red-200" aria-label="Keluar dari session">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--background)] lg:grid lg:grid-cols-[272px_1fr]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[272px] border-r border-white/8 bg-[#071320]/96 backdrop-blur-xl lg:block">{sidebar}</aside>

      {sidebarOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} aria-label="Tutup navigasi" />
          <aside className="relative h-full w-[min(88vw,310px)] border-r border-white/10 bg-[#071320] shadow-2xl">{sidebar}</aside>
        </div>
      ) : null}

      <div className="min-w-0 lg:col-start-2">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-white/8 bg-[#06111f]/82 px-4 backdrop-blur-xl sm:px-6 lg:h-20 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setSidebarOpen(true)} className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.035] text-white lg:hidden" aria-label="Buka navigasi">
              <Menu size={19} />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                <span className="hidden sm:inline">Control plane</span>
                <ChevronRight size={13} className="hidden sm:block" />
                <span className="truncate text-white">{currentItem?.label ?? 'Dashboard'}</span>
              </div>
              <p className="mono-font mt-1 hidden text-[9px] uppercase tracking-[0.15em] text-[#61798b] sm:block">BTC / SHA-256 / Follow upstream</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[0.055] px-3 py-1.5 text-[10px] font-semibold text-emerald-100 sm:inline-flex">
              <Activity size={12} /> Control plane online
            </span>
            <span className="mono-font rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#9db0bf]">Alpha.2</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1540px] px-4 py-7 sm:px-6 lg:px-8 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
