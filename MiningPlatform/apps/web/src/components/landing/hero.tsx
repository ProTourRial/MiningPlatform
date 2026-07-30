/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

'use client';

import { Activity, ArrowRight, CheckCircle2, CircleDashed, Server, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';

const pipeline = [
  { label: 'Stratum inbound', detail: 'configure · subscribe · authorize', state: 'ready' },
  { label: 'Local validation', detail: 'SHA-256d · target · duplicate · stale', state: 'ready' },
  { label: 'Durable intake', detail: 'PostgreSQL · outbox · recovery', state: 'building' },
  { label: 'Upstream relay', detail: 'job normalize · submit · correlation', state: 'next' },
] as const;

export function Hero() {
  return (
    <section id="hero" className="landing-hero relative min-h-[760px] overflow-hidden border-b border-white/10 pt-18">
      <div className="landing-grid absolute inset-0 opacity-70" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_28%,rgba(152,245,255,0.13),transparent_27%),radial-gradient(circle_at_18%_35%,rgba(215,255,99,0.09),transparent_30%)]" />
      <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#06111f] to-transparent" />

      <div className="relative mx-auto grid min-h-[calc(100vh-72px)] max-w-[1380px] items-center gap-14 px-5 py-20 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="mb-7 flex flex-wrap items-center gap-3">
            <span className="mono-font inline-flex items-center gap-2 rounded-full border border-[#d7ff63]/35 bg-[#d7ff63]/10 px-3.5 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#d7ff63]">
              <Activity size={13} />
              BTC · SHA-256 · Upstream Gateway
            </span>
            <span className="mono-font text-[10px] uppercase tracking-[0.18em] text-[#8298aa]">v0.2 development pipeline</span>
          </div>

          <h1 className="display-font max-w-5xl text-[clamp(3.4rem,7.4vw,7.4rem)] font-black uppercase leading-[0.87] tracking-[-0.065em] text-[#f5fbff]">
            Operasi mining yang
            <span className="block text-[#d7ff63]">dapat diverifikasi.</span>
          </h1>

          <p className="mt-8 max-w-2xl text-base leading-8 text-[#b8c8d5] sm:text-lg">
            Satu control plane untuk koneksi worker, validasi share, monitoring farm, rekonsiliasi reward,
            dan payout yang dapat diaudit. Mining tetap berlangsung pada ASIC, GPU, CPU, FPGA, atau rig hybrid fisik—bukan di browser.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="#pipeline"
              className="group inline-flex items-center justify-center gap-2 rounded-xl bg-[#d7ff63] px-6 py-3.5 text-sm font-extrabold text-[#06111f] transition hover:bg-[#e4ff91]"
            >
              Lihat Pipeline
              <ArrowRight size={17} className="transition group-hover:translate-x-1" />
            </Link>
            <Link
              href="/transparency"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/14 bg-white/[0.035] px-6 py-3.5 text-sm font-bold text-white transition hover:border-[#98f5ff]/45 hover:bg-[#98f5ff]/8"
            >
              <ShieldCheck size={17} />
              Halaman Transparansi
            </Link>
          </div>

          <div className="mt-10 grid max-w-2xl grid-cols-2 gap-4 border-t border-white/10 pt-7 sm:grid-cols-4">
            {[
              ['Hardware', 'Universal'],
              ['Aset awal', 'BTC'],
              ['Ledger', 'Double-entry'],
              ['Payout', 'Dinonaktifkan'],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="mono-font text-[10px] uppercase tracking-[0.15em] text-[#70879a]">{label}</p>
                <p className="mt-2 text-sm font-bold text-[#eef7fb]">{value}</p>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.97, x: 20 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          transition={{ delay: 0.12, duration: 0.58, ease: [0.23, 1, 0.32, 1] }}
          className="relative"
        >
          <div className="absolute -inset-8 rounded-full bg-[#98f5ff]/8 blur-3xl" />
          <div className="relative overflow-hidden rounded-[28px] border border-white/12 bg-[#091727]/88 shadow-2xl shadow-black/35 backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-xl bg-[#98f5ff]/10 text-[#98f5ff]">
                  <Server size={18} />
                </span>
                <div>
                  <p className="text-sm font-bold text-white">Core Mining Pipeline</p>
                  <p className="mono-font mt-0.5 text-[10px] uppercase tracking-[0.14em] text-[#7890a4]">Local development trace</p>
                </div>
              </div>
              <span className="mono-font rounded-full border border-amber-300/25 bg-amber-300/8 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-amber-200">
                Alpha
              </span>
            </div>

            <div className="space-y-3 p-5 sm:p-6">
              {pipeline.map((item, index) => {
                const complete = item.state === 'ready';
                return (
                  <div key={item.label} className="relative flex gap-4 rounded-2xl border border-white/8 bg-white/[0.025] p-4">
                    {index < pipeline.length - 1 ? <span className="absolute left-[29px] top-[46px] h-[31px] w-px bg-white/10" /> : null}
                    <span
                      className={`relative z-10 grid size-7 shrink-0 place-items-center rounded-full border ${
                        complete
                          ? 'border-[#d7ff63]/40 bg-[#d7ff63]/12 text-[#d7ff63]'
                          : item.state === 'building'
                            ? 'border-[#98f5ff]/40 bg-[#98f5ff]/10 text-[#98f5ff]'
                            : 'border-white/12 bg-white/5 text-[#668095]'
                      }`}
                    >
                      {complete ? <CheckCircle2 size={14} /> : <CircleDashed size={14} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-bold text-[#edf6fb]">{item.label}</p>
                        <span className="mono-font text-[9px] uppercase tracking-[0.14em] text-[#6f8799]">
                          {item.state}
                        </span>
                      </div>
                      <p className="mono-font mt-1.5 truncate text-[10px] text-[#8da3b5]">{item.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-3 border-t border-white/10 bg-[#071320]/80">
              {[
                ['Connections', '0'],
                ['Accepted', '0'],
                ['Hashrate', '0 TH/s'],
              ].map(([label, value]) => (
                <div key={label} className="border-r border-white/8 px-4 py-4 last:border-r-0">
                  <p className="mono-font text-[9px] uppercase tracking-[0.12em] text-[#70869a]">{label}</p>
                  <p className="mt-2 text-base font-extrabold text-white">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mono-font absolute -right-4 top-14 hidden flex-col items-center gap-3 text-[9px] uppercase tracking-[0.18em] text-[#6f8799] xl:flex">
            <span className="h-20 w-px bg-gradient-to-b from-transparent via-[#98f5ff]/60 to-[#d7ff63]/60" />
            <span className="[writing-mode:vertical-rl]">Validated operations</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
