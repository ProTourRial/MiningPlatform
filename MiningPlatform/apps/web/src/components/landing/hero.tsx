'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-white/10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(67,216,160,0.14),transparent_35%)]" />
      <div className="relative mx-auto grid max-w-7xl gap-12 px-6 py-24 lg:grid-cols-[1.1fr_0.9fr] lg:py-32">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
            Mining Pool Management Platform
          </p>
          <h1 className="max-w-4xl text-5xl font-semibold leading-tight tracking-tight md:text-7xl">
            Kelola worker, reward, dan payout dalam satu sistem.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-[var(--muted)]">
            Hubungkan ASIC melalui Stratum. Pantau hashrate dan share. Rekonsiliasi reward upstream.
            Distribusikan payout dengan ledger double-entry yang dapat diaudit.
          </p>
          <div className="mt-9 flex flex-wrap gap-4">
            <Link
              href="/register"
              className="rounded-xl bg-[var(--accent)] px-6 py-3 font-semibold text-[#04110c]"
            >
              Mulai Mining
            </Link>
            <Link
              href="/transparency"
              className="rounded-xl border border-white/15 px-6 py-3 font-semibold hover:bg-white/5"
            >
              Lihat Transparansi
            </Link>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.45 }}
          className="rounded-3xl border border-white/10 bg-[var(--surface)] p-6 shadow-2xl shadow-black/20"
        >
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--muted)]">Pool Hashrate</p>
              <p className="mt-1 text-3xl font-semibold">0 PH/s</p>
            </div>
            <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
              Gateway Setup
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              ['Worker Aktif', '0'],
              ['Accepted Share', '0'],
              ['Reward Hari Ini', '0 BTC'],
              ['Uptime', '0.00%'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs text-[var(--muted)]">{label}</p>
                <p className="mt-2 text-xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-2xl border border-dashed border-white/15 p-5 text-sm leading-6 text-[var(--muted)]">
            Data produksi akan tampil setelah Stratum gateway, upstream relay, dan share validator selesai
            dikonfigurasi.
          </div>
        </motion.div>
      </div>
    </section>
  );
}
