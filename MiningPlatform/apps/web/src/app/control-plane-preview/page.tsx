/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BellRing,
  ChevronRight,
  CircleUserRound,
  Coins,
  Cpu,
  FileClock,
  Gauge,
  KeyRound,
  LayoutDashboard,
  Menu,
  Network,
  RadioTower,
  Settings,
  ShieldCheck,
  UsersRound,
  WalletCards,
  Wifi,
} from 'lucide-react';
import Link from 'next/link';
import { BitcoinRewardFeed } from '@/components/dashboard/bitcoin-reward-feed';

const navigation: Array<{ label: string; icon: LucideIcon; gated?: boolean }> = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Workers', icon: UsersRound },
  { label: 'Hashrate', icon: Gauge },
  { label: 'Rewards', icon: Coins, gated: true },
  { label: 'Wallet', icon: WalletCards, gated: true },
  { label: 'Profile', icon: CircleUserRound },
  { label: 'Security', icon: ShieldCheck },
  { label: 'API access', icon: KeyRound },
  { label: 'Audit log', icon: FileClock },
  { label: 'Settings', icon: Settings },
];

const metrics = [
  { label: 'Hashrate 5 menit', value: '1.84 PH/s', detail: '+4.2% dari snapshot sebelumnya', icon: Gauge, tone: 'bg-[#98f5ff]/10 text-[#98f5ff]' },
  { label: 'Worker online', value: '24 / 26', detail: '2 worker memerlukan perhatian', icon: Cpu, tone: 'bg-[var(--accent)]/10 text-[var(--accent)]' },
  { label: 'Share acceptance', value: '99.72%', detail: '84,291 accepted · 237 rejected', icon: ShieldCheck, tone: 'bg-emerald-300/10 text-emerald-200' },
  { label: 'Notifikasi belum dibaca', value: '3', detail: 'Security, worker, dan system event', icon: BellRing, tone: 'bg-amber-300/10 text-amber-200' },
];

const workers = [
  ['farm-a.rack-01', '612.8 TH/s', 100],
  ['farm-a.rack-02', '487.3 TH/s', 79],
  ['farm-b.rack-07', '426.1 TH/s', 70],
  ['lab-validation-01', '318.6 TH/s', 52],
] as const;

export default function ControlPlanePreviewPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] text-white lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="hidden border-r border-white/8 bg-[#071320] lg:flex lg:min-h-screen lg:flex-col">
        <div className="flex h-20 items-center border-b border-white/8 px-5">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl border border-[var(--accent)]/25 bg-[var(--accent)]/10 text-[var(--accent)]"><Network size={19} /></span>
            <span><span className="display-font block text-base font-bold tracking-[-0.03em]">MiningPlatform</span><span className="mono-font mt-0.5 block text-[8px] uppercase tracking-[0.2em] text-[var(--muted)]">Operations control plane</span></span>
          </Link>
        </div>
        <nav className="flex-1 px-3 py-5">
          <p className="mono-font mb-2 px-3 text-[9px] uppercase tracking-[0.18em] text-[#647b8e]">Workspace preview</p>
          <div className="grid gap-1">
            {navigation.map(({ label, icon: Icon, gated }, index) => (
              <span key={label} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm ${index === 0 ? 'border-[var(--accent)]/20 bg-[var(--accent)]/10 text-white' : 'border-transparent text-[#8fa4b4]'}`}>
                <Icon size={17} className={index === 0 ? 'text-[var(--accent)]' : 'text-[#647b8e]'} />
                <span className="flex-1 font-medium">{label}</span>
                {gated ? <span className="mono-font rounded border border-amber-300/15 px-1.5 py-0.5 text-[7px] uppercase tracking-[0.12em] text-amber-200/70">Gated</span> : null}
                {index === 0 ? <ChevronRight size={14} className="text-[var(--accent)]" /> : null}
              </span>
            ))}
          </div>
        </nav>
        <div className="border-t border-white/8 p-3">
          <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-3">
            <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#98f5ff]/10 text-xs font-bold text-[#98f5ff]">AN</span><div className="min-w-0"><p className="truncate text-sm font-semibold">Abia Nugrahanto</p><p className="truncate text-[10px] text-[var(--muted)]">Owner · Preview workspace</p></div></div>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-white/8 bg-[#06111f]/88 px-4 backdrop-blur-xl sm:px-6 lg:h-20 lg:px-8">
          <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl border border-white/10 lg:hidden"><Menu size={18} /></span><div><p className="text-xs text-[var(--muted)]">Control plane <span className="mx-1.5">/</span> <span className="text-white">Overview</span></p><p className="mono-font mt-1 hidden text-[8px] uppercase tracking-[0.15em] text-[#61798b] sm:block">BTC / SHA-256 / Follow upstream</p></div></div>
          <div className="flex items-center gap-2"><span className="hidden items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[0.055] px-3 py-1.5 text-[9px] text-emerald-100 sm:inline-flex"><Activity size={11} /> Control plane online</span><span className="mono-font rounded-full border border-[#98f5ff]/15 bg-[#98f5ff]/[0.055] px-3 py-1.5 text-[8px] uppercase tracking-[0.14em] text-[#bdeff4]">Preview data</span></div>
        </header>

        <div className="mx-auto max-w-[1520px] px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
          <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
            <div><p className="mono-font text-[9px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Operations workspace</p><h1 className="display-font mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">Operational overview</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted)]">Satu pandangan untuk performa worker, kualitas share, dan kesiapan pipeline mining.</p></div>
            <Link href="/login" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-bold text-[#04110c]">Masuk ke workspace <ChevronRight size={15} /></Link>
          </div>

          <section className="dashboard-card relative mt-8 overflow-hidden rounded-3xl p-5 sm:p-6 lg:p-7">
            <div className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full bg-[#98f5ff]/8 blur-3xl" />
            <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div><div className="flex flex-wrap gap-2"><span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/[0.06] px-3 py-1.5 text-[9px] text-emerald-100"><span className="size-1.5 animate-pulse rounded-full bg-emerald-300" />Realtime terhubung</span><span className="mono-font rounded-full border border-white/10 px-3 py-1.5 text-[8px] uppercase tracking-[0.15em] text-[#8fa4b4]">PostgreSQL + Redis Stream</span></div><h2 className="display-font mt-5 text-2xl font-bold tracking-[-0.035em] sm:text-3xl">Operational mining snapshot</h2><p className="mt-2 text-sm text-[var(--muted)]">Snapshot tervalidasi · 13 Agustus 2026, 14.32.08 WIB</p></div><span className="mono-font text-[8px] uppercase tracking-[0.15em] text-[#61798b]">Auto refresh · 30s</span></div>
          </section>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map(({ label, value, detail, icon: Icon, tone }) => <article key={label} className="dashboard-card rounded-2xl p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-xs text-[var(--muted)]">{label}</p><p className="display-font mt-3 text-2xl font-bold tracking-[-0.035em]">{value}</p></div><span className={`grid size-10 place-items-center rounded-xl ${tone}`}><Icon size={18} /></span></div><p className="mt-4 text-[10px] text-[#71899a]">{detail}</p></article>)}
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
            <section className="dashboard-card rounded-3xl p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4"><div><p className="mono-font text-[8px] uppercase tracking-[0.18em] text-[#71899a]">Live distribution</p><h3 className="mt-2 text-lg font-semibold">Hashrate per worker</h3></div><span className="text-[10px] text-[var(--muted)]">24 telemetry source</span></div>
              <div className="mt-5 space-y-3">{workers.map(([name, value, width]) => <div key={name} className="dashboard-inset rounded-2xl p-4"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-lg bg-emerald-300/8 text-emerald-200"><Wifi size={14} /></span><div><p className="text-sm font-semibold">{name}</p><p className="mono-font mt-1 text-[8px] text-[#647b8e]">SHA-256 · ONLINE</p></div></div><p className="text-sm font-semibold text-[#c9f7fb]">{value}</p></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.055]"><div className="h-full rounded-full bg-gradient-to-r from-[#98f5ff] to-[var(--accent)]" style={{ width: `${width}%` }} /></div></div>)}</div>
            </section>

            <div className="space-y-5">
              <section className="dashboard-card rounded-3xl p-5 sm:p-6"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]"><RadioTower size={18} /></span><div><p className="text-sm font-semibold">Upstream status</p><p className="text-[10px] text-[var(--muted)]">Multi-provider resilience</p></div></div><div className="mt-5 space-y-3">{[['Primary pool','HEALTHY'],['Backup pool','STANDBY'],['Circuit breaker','CLOSED']].map(([label,status]) => <div key={label} className="flex items-center justify-between rounded-xl border border-white/8 px-3 py-3 text-xs"><span className="text-[var(--muted)]">{label}</span><span className="mono-font text-[8px] text-emerald-100">{status}</span></div>)}</div></section>
              <section className="rounded-3xl border border-amber-300/15 bg-amber-300/[0.045] p-5"><div className="flex items-start gap-3"><WalletCards className="mt-0.5 shrink-0 text-amber-200" size={17} /><div><p className="text-sm font-semibold text-amber-50">Financial settlement gated</p><p className="mt-2 text-[10px] leading-5 text-amber-100/60">Reward settlement, wallet orchestration, dan payout menunggu release gate.</p></div></div></section>
            </div>
          </div>
          <div className="mt-5"><BitcoinRewardFeed /></div>
        </div>
      </div>
    </main>
  );
}
