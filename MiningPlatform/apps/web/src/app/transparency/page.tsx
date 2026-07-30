/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import Link from 'next/link';

export default function TransparencyPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <Link href="/" className="text-sm text-[var(--accent)]">← Beranda</Link>
      <h1 className="mt-8 text-4xl font-semibold">Transparansi Platform</h1>
      <p className="mt-4 max-w-3xl leading-7 text-[var(--muted)]">Statistik publik hanya menampilkan data agregat dan tertunda. Informasi privat miner tidak dipublikasikan.</p>
      <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {['Total Hashrate Pool','Worker Aktif','Reward Hari Ini','Total Payout','Status Upstream','Uptime Server'].map((label) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-[var(--surface)] p-5"><p className="text-sm text-[var(--muted)]">{label}</p><p className="mt-3 text-2xl font-semibold">Belum tersedia</p></div>
        ))}
      </div>
    </main>
  );
}
