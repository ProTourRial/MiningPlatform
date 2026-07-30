/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Cpu, Gauge, Microchip, MonitorCog, RadioTower, ServerCog } from 'lucide-react';

const hardware = [
  { type: 'ASIC', icon: ServerCog, status: 'Supported', detail: 'Stratum SHA-256 dan miner API/agent' },
  { type: 'GPU', icon: MonitorCog, status: 'Compatible', detail: 'Jika software miner berbicara Stratum SHA-256' },
  { type: 'CPU', icon: Cpu, status: 'Compatible', detail: 'Secara protokol; biasanya tidak efisien untuk BTC' },
  { type: 'FPGA', icon: Microchip, status: 'Compatible', detail: 'Jika firmware mendukung Stratum dan algoritma aktif' },
] as const;

const detection = [
  ['Stratum signature', 'Membaca nama dan versi software dari mining.subscribe.'],
  ['User declaration', 'Pemilik worker menetapkan jenis perangkat sebagai data referensi.'],
  ['Monitoring agent', 'Mengirim inventory CPU, GPU, FPGA, ASIC, OS, dan jumlah device.'],
  ['Miner API', 'Memberikan vendor, model, suhu, fan, daya, firmware, dan telemetry.'],
] as const;

export function UniversalMinerPanel() {
  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {hardware.map(({ type, icon: Icon, status, detail }) => (
          <article key={type} className="rounded-2xl border border-white/10 bg-[var(--surface)] p-5">
            <div className="flex items-center justify-between">
              <span className="grid size-10 place-items-center rounded-xl bg-cyan-300/10 text-cyan-200"><Icon size={20} /></span>
              <span className="rounded-full border border-lime-300/20 bg-lime-300/8 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-lime-200">{status}</span>
            </div>
            <h3 className="mt-5 text-xl font-bold">{type}</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{detail}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-white/10 bg-[var(--surface)] p-6">
          <div className="flex items-center gap-3"><RadioTower className="text-lime-200" size={20} /><h2 className="text-lg font-semibold">Lapisan deteksi universal</h2></div>
          <div className="mt-5 space-y-3">
            {detection.map(([title, description]) => (
              <div key={title} className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
                <p className="font-semibold">{title}</p>
                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <aside className="rounded-2xl border border-amber-300/15 bg-amber-300/5 p-6">
          <Gauge className="text-amber-200" size={21} />
          <h2 className="mt-5 text-lg font-semibold">Batas algoritma saat ini</h2>
          <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
            Hardware tidak dibatasi ke ASIC. Namun pipeline share aktif masih BTC/SHA-256. CPU, GPU, atau FPGA hanya dapat menambang melalui gateway ini bila software dan perangkatnya mendukung SHA-256 Stratum V1.
          </p>
          <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
            Coin atau algoritma lain membutuhkan adapter validasi, normalisasi job, difficulty, dan upstream terpisah.
          </p>
        </aside>
      </div>
    </div>
  );
}
