/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import type { ReactNode } from 'react';
import { Activity, ArrowLeft, CheckCircle2, Network, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

const assurances = [
  'Session rotation dan replay protection',
  'TOTP 2FA dan recovery code',
  'Role-based control plane access',
];

export function AuthCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#06111f]">
      <div className="landing-grid pointer-events-none absolute inset-0 opacity-45" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(215,255,99,0.09),transparent_30%),radial-gradient(circle_at_82%_75%,rgba(152,245,255,0.1),transparent_28%)]" />

      <div className="relative mx-auto grid min-h-screen max-w-[1380px] lg:grid-cols-[0.9fr_1.1fr]">
        <aside className="hidden border-r border-white/8 px-12 py-12 lg:flex lg:flex-col lg:justify-between xl:px-16">
          <Link href="/" className="flex items-center gap-3" aria-label="MiningPlatform homepage">
            <span className="grid size-10 place-items-center rounded-xl border border-[var(--accent)]/25 bg-[var(--accent)]/10 text-[var(--accent)]"><Network size={19} /></span>
            <div><p className="display-font font-bold">MiningPlatform</p><p className="mono-font mt-0.5 text-[8px] uppercase tracking-[0.2em] text-[var(--muted)]">Operations control plane</p></div>
          </Link>
          <div className="max-w-lg">
            <span className="mono-font inline-flex items-center gap-2 rounded-full border border-[#98f5ff]/20 bg-[#98f5ff]/8 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-[#98f5ff]"><Activity size={12} /> Identity & access</span>
            <h2 className="display-font mt-7 text-5xl font-black uppercase leading-[0.92] tracking-[-0.055em]">Akses operasi mining dengan <span className="text-[var(--accent)]">kontrol yang tegas.</span></h2>
            <p className="mt-6 max-w-md text-sm leading-7 text-[#9fb2c0]">Kelola worker, telemetry, API key, dan security posture dari satu workspace yang dapat diaudit.</p>
            <div className="mt-8 space-y-3">
              {assurances.map((item) => <div key={item} className="flex items-center gap-3 text-sm text-[#c3d0d9]"><CheckCircle2 size={16} className="text-[var(--accent)]" /><span>{item}</span></div>)}
            </div>
          </div>
          <div className="flex items-center gap-3 border-t border-white/8 pt-6 text-[10px] text-[#6f8799]"><ShieldCheck size={14} /><span>Control Plane v0.3.0-alpha.2 · Proprietary preview</span></div>
        </aside>

        <section className="grid min-h-screen place-items-center px-5 py-10 sm:px-8 lg:px-12">
          <div className="w-full max-w-[480px]">
            <Link href="/" className="inline-flex items-center gap-2 text-xs font-semibold text-[#9fb2c0] transition hover:text-white lg:hidden"><ArrowLeft size={15} /> Kembali ke beranda</Link>
            <div className="mt-6 rounded-[28px] border border-white/10 bg-[#0a1828]/88 p-6 shadow-2xl shadow-black/25 backdrop-blur-xl sm:p-8 lg:mt-0">
              <Link href="/" className="hidden items-center gap-2 text-xs font-semibold text-[#9fb2c0] transition hover:text-white lg:inline-flex"><ArrowLeft size={15} /> Beranda</Link>
              <p className="mono-font mt-7 text-[9px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Secure workspace</p>
              <h1 className="display-font mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">{title}</h1>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{description}</p>
              <div className="mt-7">{children}</div>
            </div>
            <p className="mono-font mt-5 text-center text-[8px] uppercase tracking-[0.15em] text-[#526b7e]">Protected by secure httpOnly session cookies</p>
          </div>
        </section>
      </div>
    </main>
  );
}
