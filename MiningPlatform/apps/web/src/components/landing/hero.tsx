'use client';

import {
  ArrowRight,
  Check,
  CircleDashed,
  Database,
  Network,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';

const pipeline = [
  { label: 'Stratum inbound', detail: 'configure · subscribe · authorize', state: 'ready' },
  { label: 'Local validation', detail: 'SHA-256d · target · duplicate · stale', state: 'ready' },
  { label: 'Durable intake', detail: 'PostgreSQL · outbox · recovery', state: 'building' },
  { label: 'Upstream relay', detail: 'normalize · submit · correlate', state: 'next' },
] as const;

export function Hero() {
  return (
    <section
      id="hero"
      className="landing-hero relative min-h-[780px] overflow-hidden border-b border-white/10 pt-[76px]"
    >
      <div className="landing-grid absolute inset-0 opacity-70" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_22%,rgba(131,215,195,0.13),transparent_26%),radial-gradient(circle_at_12%_36%,rgba(213,239,104,0.08),transparent_28%)]" />
      <div className="absolute inset-x-0 bottom-0 h-52 bg-gradient-to-t from-[#0a0d0b] to-transparent" />

      <div className="relative mx-auto grid min-h-[704px] max-w-[1440px] items-center gap-16 px-5 py-20 sm:px-8 lg:grid-cols-[1.03fr_0.97fr] lg:px-10 lg:py-24">
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="mb-7 flex flex-wrap items-center gap-3">
            <span className="mono-font inline-flex items-center gap-2 rounded-full border border-[#d5ef68]/35 bg-[#d5ef68]/10 px-3.5 py-2 text-[9px] font-bold uppercase tracking-[0.17em] text-[#d5ef68]">
              <Sparkles size={13} /> BTC / SHA-256 / Gateway
            </span>
            <span className="mono-font text-[9px] uppercase tracking-[0.17em] text-[#829188]">
              v0.3 · control plane alpha
            </span>
          </div>
          <h1 className="display-font max-w-4xl text-[clamp(3.5rem,7.4vw,7.6rem)] font-black uppercase leading-[0.86] tracking-[-0.075em] text-[#f3f5ef]">
            Operasi mining yang <span className="block text-[#d5ef68]">dapat diverifikasi.</span>
          </h1>
          <p className="mt-8 max-w-2xl text-base leading-8 text-[#b9c4ba] sm:text-lg">
            Satu control plane untuk koneksi worker, validasi share, monitoring farm, rekonsiliasi
            reward, dan payout yang dapat diaudit. Mining tetap berlangsung pada perangkat
            fisik—bukan di browser.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="#pipeline"
              className="group inline-flex items-center justify-center gap-2 rounded-xl bg-[#d5ef68] px-6 py-3.5 text-sm font-extrabold text-[#0a0d0b] transition duration-200 hover:bg-[#e2f58b] active:scale-[0.97]"
            >
              Jelajahi pipeline{' '}
              <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/transparency"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-6 py-3.5 text-sm font-bold text-white transition duration-200 hover:border-[#83d7c3]/45 hover:bg-[#83d7c3]/8 active:scale-[0.97]"
            >
              <ShieldCheck size={17} /> Lihat transparansi
            </Link>
          </div>
          <div className="mt-11 grid max-w-2xl grid-cols-2 gap-y-6 border-t border-white/10 pt-7 sm:grid-cols-4 sm:gap-4">
            {[
              ['Hardware', 'Universal'],
              ['Aset awal', 'BTC'],
              ['Ledger', 'Double-entry'],
              ['Payout', 'Disabled'],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="mono-font text-[9px] uppercase tracking-[0.15em] text-[#718077]">
                  {label}
                </p>
                <p className="mt-2 text-sm font-bold text-[#eef3ed]">{value}</p>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.97, x: 18 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          transition={{ delay: 0.12, duration: 0.62, ease: [0.23, 1, 0.32, 1] }}
          className="relative"
        >
          <div className="absolute -inset-10 rounded-full bg-[#83d7c3]/8 blur-3xl" />
          <div className="relative overflow-hidden rounded-[28px] border border-white/14 bg-[#151b17]/92 shadow-2xl shadow-black/40 backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-xl bg-[#83d7c3]/10 text-[#83d7c3]">
                  <Network size={18} />
                </span>
                <div>
                  <p className="text-sm font-bold text-white">Core mining pipeline</p>
                  <p className="mono-font mt-0.5 text-[9px] uppercase tracking-[0.14em] text-[#829188]">
                    Local development trace
                  </p>
                </div>
              </div>
              <span className="mono-font rounded-full border border-[#f1c27d]/25 bg-[#f1c27d]/8 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[#f1c27d]">
                Alpha
              </span>
            </div>
            <div className="space-y-2.5 p-5 sm:p-6">
              {pipeline.map((item, index) => {
                const complete = item.state === 'ready';
                return (
                  <div
                    key={item.label}
                    className="relative flex gap-4 rounded-2xl border border-white/9 bg-white/[0.03] p-4 transition-colors hover:border-[#83d7c3]/30"
                  >
                    {index < pipeline.length - 1 ? (
                      <span className="absolute left-[29px] top-[46px] h-[31px] w-px bg-white/10" />
                    ) : null}
                    <span
                      className={`relative z-10 grid size-7 shrink-0 place-items-center rounded-full border ${
                        complete
                          ? 'border-[#d5ef68]/45 bg-[#d5ef68]/12 text-[#d5ef68]'
                          : item.state === 'building'
                          ? 'border-[#83d7c3]/45 bg-[#83d7c3]/10 text-[#83d7c3]'
                          : 'border-white/13 bg-white/5 text-[#6f8075]'
                      }`}
                    >
                      {complete ? (
                        <Check size={14} />
                      ) : item.state === 'building' ? (
                        <Database size={13} />
                      ) : (
                        <CircleDashed size={14} />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-bold text-[#edf2ec]">{item.label}</p>
                        <span className="mono-font text-[9px] uppercase tracking-[0.14em] text-[#718077]">
                          {item.state}
                        </span>
                      </div>
                      <p className="mono-font mt-1.5 truncate text-[10px] text-[#91a096]">
                        {item.detail}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-3 border-t border-white/10 bg-[#101511]/90">
              {[
                ['Connections', '0'],
                ['Accepted', '0'],
                ['Hashrate', '0 TH/s'],
              ].map(([label, value]) => (
                <div key={label} className="border-r border-white/8 px-4 py-4 last:border-r-0">
                  <p className="mono-font text-[9px] uppercase tracking-[0.12em] text-[#718077]">
                    {label}
                  </p>
                  <p className="mt-2 text-base font-extrabold text-white">{value}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="mono-font absolute -right-5 top-14 hidden flex-col items-center gap-3 text-[9px] uppercase tracking-[0.18em] text-[#718077] xl:flex">
            <span className="h-20 w-px bg-gradient-to-b from-transparent via-[#83d7c3]/70 to-[#d5ef68]/70" />
            <span className="[writing-mode:vertical-rl]">Validated operations</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
