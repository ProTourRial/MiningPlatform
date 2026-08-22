/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Calculator,
  Cpu,
  DatabaseZap,
  Gauge,
  HardDrive,
  Layers3,
  LockKeyhole,
  Network,
  RadioTower,
  ShieldCheck,
  Thermometer,
  WalletCards,
  Zap,
} from 'lucide-react';
import Link from 'next/link';

const platformFeatures: Array<{
  icon: LucideIcon;
  title: string;
  description: string;
  tag: string;
}> = [
  {
    icon: Network,
    title: 'Stratum Gateway',
    description:
      'Menerima koneksi worker, mengelola sesi, memvalidasi share lokal, lalu meneruskan pekerjaan ke upstream pool.',
    tag: 'Mining core',
  },
  {
    icon: Cpu,
    title: 'Farm Monitoring',
    description:
      'Menggabungkan data Stratum dan agent perangkat untuk menampilkan hashrate, uptime, suhu, fan, daya, dan efisiensi.',
    tag: 'Realtime',
  },
  {
    icon: DatabaseZap,
    title: 'Auditable Accounting',
    description:
      'Reward, fee, dan kewajiban payout dicatat melalui jurnal double-entry. Wallet tidak mengubah saldo user secara langsung.',
    tag: 'Ledger',
  },
  {
    icon: ShieldCheck,
    title: 'Operational Control',
    description:
      'Owner mengelola maintenance, upstream health, emergency stop, audit log, dan tindakan sensitif melalui akses privat.',
    tag: 'Security',
  },
];

const pipelineSteps = [
  [
    '01',
    'Miner Connect',
    'ASIC, GPU, CPU, FPGA, atau rig hybrid menghubungkan worker melalui Stratum V1.',
  ],
  [
    '02',
    'Validate Share',
    'Server memeriksa job, target difficulty, nonce, duplicate, stale state, dan format submission.',
  ],
  [
    '03',
    'Durable Intake',
    'Share dan outbox event harus tersimpan secara atomik sebelum dianggap aman untuk diproses ulang.',
  ],
  [
    '04',
    'Relay Upstream',
    'Share diteruskan ke pool upstream dan dikorelasikan dengan respons accepted atau rejected.',
  ],
  [
    '05',
    'Aggregate',
    'Difficulty terakumulasi menjadi bucket hashrate dan statistik worker untuk beberapa window waktu.',
  ],
  [
    '06',
    'Settle Later',
    'Reward baru dihitung setelah data upstream direkonsiliasi. Ledger dan wallet berada pada fase sesudahnya.',
  ],
] as const;

const monitoringMetrics = [
  { icon: Gauge, label: 'Accepted-share hashrate', value: '0 TH/s', note: 'rolling 5 menit' },
  { icon: Activity, label: 'Worker state', value: 'Offline', note: 'belum ada koneksi' },
  { icon: Thermometer, label: 'Device temperature', value: 'N/A', note: 'agent / miner API' },
  { icon: Zap, label: 'Power efficiency', value: 'N/A', note: 'J/TH' },
];

const transparencyMetrics = [
  ['Pool hashrate', '0 PH/s'],
  ['Worker aktif', '0'],
  ['Accepted share', '0'],
  ['Reject rate', '0.00%'],
  ['Fee standar / referral', '0,50% / 0,375%'],
  ['Status gateway', 'Development'],
] as const;

export function LandingSections() {
  const developmentDashboardEnabled =
    process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_ENABLE_DEVELOPMENT_DASHBOARD !== 'false';
  return (
    <>
      <section id="platform" className="relative border-b border-white/10 py-24 sm:py-30">
        <div className="landing-grid absolute inset-0 opacity-25" />
        <div className="relative mx-auto max-w-[1380px] px-5 sm:px-8">
          <SectionHeading
            eyebrow="Platform"
            title="Satu sistem. Batas domain yang jelas."
            description="Platform ini bukan cloud mining dan tidak menjual kontrak hashrate. Seluruh data berasal dari perangkat fisik dan proses operasional yang dapat ditelusuri."
          />

          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {platformFeatures.map(({ icon: Icon, title, description, tag }) => (
              <article
                key={title}
                className="group rounded-2xl border border-white/10 bg-[#091827]/72 p-6 transition hover:-translate-y-1 hover:border-[#d7ff63]/35 hover:bg-[#0b1b2c]"
              >
                <div className="flex items-center justify-between">
                  <span className="grid size-11 place-items-center rounded-xl border border-[#98f5ff]/18 bg-[#98f5ff]/8 text-[#98f5ff] transition group-hover:border-[#d7ff63]/25 group-hover:bg-[#d7ff63]/8 group-hover:text-[#d7ff63]">
                    <Icon size={20} />
                  </span>
                  <span className="mono-font text-[9px] font-semibold uppercase tracking-[0.16em] text-[#72899d]">
                    {tag}
                  </span>
                </div>
                <h3 className="display-font mt-8 text-2xl font-extrabold tracking-[-0.035em] text-white">
                  {title}
                </h3>
                <p className="mt-4 text-sm leading-7 text-[#aabcca]">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="hardware"
        className="relative border-b border-white/10 bg-[#07131f] py-24 sm:py-30"
      >
        <div className="mx-auto max-w-[1380px] px-5 sm:px-8">
          <SectionHeading
            eyebrow="Universal Miner Detection"
            title="Kenali perangkat tanpa mengunci platform ke ASIC."
            description="Stratum tidak selalu menyatakan jenis hardware secara pasti. Platform menggabungkan signature software, deklarasi user, monitoring agent, dan miner API agar hasil deteksi memiliki sumber serta tingkat keyakinan yang jelas."
          />
          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              [
                'ASIC',
                'High confidence',
                'Firmware vendor, Stratum signature, suhu, fan, daya, dan hashboard.',
              ],
              [
                'GPU',
                'Agent verified',
                'Inventory NVIDIA, AMD, atau Intel serta software miner yang digunakan.',
              ],
              ['CPU', 'Agent verified', 'Arsitektur, jumlah core/thread, OS, dan software miner.'],
              [
                'FPGA / Hybrid',
                'Evidence based',
                'Perangkat campuran tetap tercatat tanpa dipaksa menjadi satu tipe yang salah.',
              ],
            ].map(([type, confidence, description]) => (
              <article key={type} className="rounded-2xl border border-white/9 bg-[#0a1928]/74 p-6">
                <p className="mono-font text-[9px] font-bold uppercase tracking-[0.16em] text-[#98f5ff]">
                  {confidence}
                </p>
                <h3 className="display-font mt-5 text-2xl font-black text-white">{type}</h3>
                <p className="mt-3 text-sm leading-7 text-[#a8bac8]">{description}</p>
              </article>
            ))}
          </div>
          <div className="mt-5 rounded-2xl border border-amber-300/16 bg-amber-300/5 p-5 text-sm leading-7 text-amber-100/80">
            Universal hardware tidak berarti seluruh algoritma sudah aktif. Rilis ini memvalidasi
            BTC/SHA-256; algoritma lain ditambahkan melalui adapter terpisah agar perhitungan share
            tidak dicampur.
          </div>
        </div>
      </section>

      <section
        id="pipeline"
        className="relative overflow-hidden border-b border-white/10 bg-[#081522] py-24 sm:py-30"
      >
        <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,rgba(152,245,255,0.07),transparent_58%)]" />
        <div className="relative mx-auto max-w-[1380px] px-5 sm:px-8">
          <div className="grid gap-12 lg:grid-cols-[0.76fr_1.24fr]">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <SectionHeading
                eyebrow="Validated Pipeline"
                title="Share valid lebih dulu. Reward menyusul."
                description="Urutan dependensi ini tidak dapat dibalik. Reward, ledger, dan payout hanya boleh berdiri di atas share yang tervalidasi dan dapat direkonsiliasi."
              />
              <div className="mt-8 rounded-2xl border border-[#d7ff63]/18 bg-[#d7ff63]/6 p-5">
                <p className="mono-font text-[10px] font-bold uppercase tracking-[0.16em] text-[#d7ff63]">
                  Current release boundary
                </p>
                <p className="mt-3 text-sm leading-6 text-[#b9c9d5]">
                  v0.2 berfokus pada Stratum, share validation, durable intake, upstream response,
                  hashrate, WebSocket, dan dashboard realtime.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {pipelineSteps.map(([number, title, description], index) => (
                <article
                  key={number}
                  className="group grid gap-4 rounded-2xl border border-white/9 bg-[#0a1929]/76 p-5 transition hover:border-[#98f5ff]/28 sm:grid-cols-[76px_1fr_auto] sm:items-center sm:p-6"
                >
                  <div className="mono-font text-3xl font-black tracking-[-0.06em] text-[#263e52] transition group-hover:text-[#d7ff63]">
                    {number}
                  </div>
                  <div>
                    <h3 className="display-font text-xl font-extrabold tracking-[-0.025em] text-white">
                      {title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[#a9bbc9]">{description}</p>
                  </div>
                  <span
                    className={`mono-font w-fit rounded-full border px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.14em] ${
                      index < 2
                        ? 'border-[#d7ff63]/25 bg-[#d7ff63]/8 text-[#d7ff63]'
                        : index < 5
                        ? 'border-[#98f5ff]/22 bg-[#98f5ff]/7 text-[#98f5ff]'
                        : 'border-white/10 bg-white/4 text-[#71899d]'
                    }`}
                  >
                    {index < 2 ? 'Alpha ready' : index < 5 ? 'Next build' : 'Later phase'}
                  </span>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="monitoring" className="relative border-b border-white/10 py-24 sm:py-30">
        <div className="mx-auto max-w-[1380px] px-5 sm:px-8">
          <div className="grid items-center gap-14 lg:grid-cols-[0.92fr_1.08fr]">
            <div>
              <SectionHeading
                eyebrow="Mining Farm Dashboard"
                title="Data operasional tanpa menyamarkan sumbernya."
                description="Dashboard membedakan hashrate berbasis accepted share, hashrate rolling, dan data yang dilaporkan perangkat. Angka yang berbeda tidak digabung menjadi satu metrik palsu."
              />
              <div className="mt-9 grid grid-cols-2 gap-3">
                {monitoringMetrics.map(({ icon: Icon, label, value, note }) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-white/9 bg-[#091827]/72 p-4 sm:p-5"
                  >
                    <div className="flex items-center justify-between text-[#98f5ff]">
                      <Icon size={17} />
                      <span className="mono-font text-[9px] uppercase tracking-[0.12em] text-[#70879a]">
                        {note}
                      </span>
                    </div>
                    <p className="mt-5 text-lg font-extrabold text-white">{value}</p>
                    <p className="mt-1 text-xs leading-5 text-[#8fa5b6]">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-[26px] border border-white/12 bg-[#081522] shadow-2xl shadow-black/25">
              <div className="flex items-center justify-between border-b border-white/9 px-5 py-4">
                <div>
                  <p className="text-sm font-bold text-white">Farm Operations</p>
                  <p className="mono-font mt-1 text-[9px] uppercase tracking-[0.14em] text-[#71899c]">
                    Realtime dashboard preview
                  </p>
                </div>
                <span className="inline-flex items-center gap-2 text-xs font-semibold text-[#8da3b4]">
                  <span className="size-2 rounded-full bg-[#526b7d]" /> No worker connected
                </span>
              </div>

              <div className="grid gap-px bg-white/8 sm:grid-cols-3">
                {[
                  ['Current', '0 TH/s'],
                  ['Average 5m', '0 TH/s'],
                  ['Reject rate', '0.00%'],
                ].map(([label, value]) => (
                  <div key={label} className="bg-[#0a1928] px-5 py-5">
                    <p className="mono-font text-[9px] uppercase tracking-[0.14em] text-[#70879a]">
                      {label}
                    </p>
                    <p className="mt-3 text-2xl font-black tracking-tight text-white">{value}</p>
                  </div>
                ))}
              </div>

              <div className="p-5 sm:p-6">
                <div className="relative h-52 overflow-hidden rounded-2xl border border-white/8 bg-[#06111f] p-4">
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:36px_36px]" />
                  <svg
                    viewBox="0 0 600 180"
                    className="relative h-full w-full"
                    aria-label="Development hashrate chart placeholder"
                  >
                    <defs>
                      <linearGradient id="chartLine" x1="0" x2="1">
                        <stop offset="0" stopColor="#98f5ff" />
                        <stop offset="1" stopColor="#d7ff63" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0 146 C70 145 86 128 142 132 S230 112 286 119 S371 84 430 95 S520 54 600 66"
                      fill="none"
                      stroke="url(#chartLine)"
                      strokeWidth="4"
                      strokeLinecap="round"
                      opacity="0.86"
                    />
                    <path
                      d="M0 146 C70 145 86 128 142 132 S230 112 286 119 S371 84 430 95 S520 54 600 66 L600 180 L0 180 Z"
                      fill="url(#chartLine)"
                      opacity="0.06"
                    />
                  </svg>
                  <div className="absolute inset-x-4 bottom-4 flex justify-between mono-font text-[8px] uppercase tracking-[0.12em] text-[#587083]">
                    <span>-5m</span>
                    <span>-4m</span>
                    <span>-3m</span>
                    <span>-2m</span>
                    <span>-1m</span>
                    <span>now</span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {['Online', 'Accepted', 'Rejected', 'Last share'].map((label) => (
                    <div
                      key={label}
                      className="rounded-xl border border-white/8 bg-white/[0.025] p-3"
                    >
                      <p className="mono-font text-[8px] uppercase tracking-[0.12em] text-[#6d8598]">
                        {label}
                      </p>
                      <p className="mt-2 text-sm font-bold text-[#e9f3f8]">
                        {label === 'Last share' ? 'Never' : '0'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="simulator"
        className="relative overflow-hidden border-b border-white/10 bg-[#081522] py-24 sm:py-30"
      >
        <div className="absolute -left-40 top-20 size-96 rounded-full bg-[#d7ff63]/5 blur-3xl" />
        <div className="relative mx-auto max-w-[1380px] px-5 sm:px-8">
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <SectionHeading
                eyebrow="Mining Analytics"
                title="Simulator untuk analisis. Bukan saldo investasi."
                description="Perhitungan keuntungan berdiri terpisah dari mining nyata. Hasilnya hanya estimasi berdasarkan parameter jaringan, perangkat, listrik, harga aset, dan fee."
              />
              <div className="mt-8 flex flex-wrap gap-2">
                {['Hashrate', 'Power', 'Electricity', 'Difficulty', 'Block reward', 'Pool fee'].map(
                  (item) => (
                    <span
                      key={item}
                      className="mono-font rounded-full border border-white/10 bg-white/[0.035] px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-[#91a6b6]"
                    >
                      {item}
                    </span>
                  ),
                )}
              </div>
            </div>

            <div className="rounded-[26px] border border-white/12 bg-[#0a1928]/82 p-5 sm:p-7">
              <div className="flex items-center justify-between border-b border-white/9 pb-5">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-[#d7ff63]/10 text-[#d7ff63]">
                    <Calculator size={19} />
                  </span>
                  <div>
                    <p className="font-bold text-white">Profitability Preview</p>
                    <p className="mono-font mt-1 text-[9px] uppercase tracking-[0.14em] text-[#71899c]">
                      Analytical output only
                    </p>
                  </div>
                </div>
                <span className="mono-font text-[9px] uppercase tracking-[0.14em] text-[#d7ff63]">
                  BTC / SHA-256
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  ['Hashrate', '110 TH/s'],
                  ['Power draw', '3,250 W'],
                  ['Electricity', 'Rp 1.700 / kWh'],
                  ['Platform fee', '0.50% · referral 0.375%'],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-white/8 bg-[#071522] px-4 py-3.5"
                  >
                    <p className="mono-font text-[8px] uppercase tracking-[0.12em] text-[#71899b]">
                      {label}
                    </p>
                    <p className="mt-2 text-sm font-bold text-[#edf6fa]">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-[#98f5ff]/17 bg-[#98f5ff]/6 p-5">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="mono-font text-[9px] uppercase tracking-[0.13em] text-[#7ea3ad]">
                      Estimated net result
                    </p>
                    <p className="mt-2 text-3xl font-black tracking-[-0.04em] text-white">
                      Belum dihitung
                    </p>
                  </div>
                  <BarChart3 className="text-[#98f5ff]" />
                </div>
                <p className="mt-4 text-xs leading-5 text-[#91a9b7]">
                  Nilai aktual membutuhkan sumber harga, difficulty, block reward, dan tarif listrik
                  yang terverifikasi.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="transparency" className="relative border-b border-white/10 py-24 sm:py-30">
        <div className="mx-auto max-w-[1380px] px-5 sm:px-8">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <SectionHeading
              eyebrow="Public Transparency"
              title="Tampilkan fakta agregat. Lindungi data privat."
              description="Statistik publik disajikan dengan penundaan dan tanpa membocorkan IP miner, lokasi farm, kredensial, private key, atau saldo individu."
            />
            <Link
              href="/transparency"
              className="group inline-flex shrink-0 items-center gap-2 text-sm font-bold text-[#d7ff63]"
            >
              Buka dashboard transparansi{' '}
              <ArrowUpRight
                size={17}
                className="transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              />
            </Link>
          </div>

          <div className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/8 md:grid-cols-3 lg:grid-cols-6">
            {transparencyMetrics.map(([label, value]) => (
              <div key={label} className="bg-[#091827] p-5 sm:p-6">
                <p className="mono-font text-[9px] uppercase tracking-[0.13em] text-[#70879a]">
                  {label}
                </p>
                <p className="mt-4 text-xl font-black tracking-tight text-white">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-300/15 bg-amber-300/5 px-4 py-3.5 text-xs leading-5 text-amber-100/78">
            <RadioTower size={16} className="mt-0.5 shrink-0" />
            Nilai di atas merupakan placeholder development. Data produksi baru dapat ditampilkan
            setelah upstream connector, durable intake, dan otorisasi monitoring selesai.
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#081522] py-24 sm:py-30">
        <div className="mx-auto max-w-[1380px] px-5 sm:px-8">
          <SectionHeading
            eyebrow="Operating Principles"
            title="Keamanan dibangun dari batas sistem."
            description="Setiap komponen memiliki tanggung jawab terbatas. Tidak ada service yang memperoleh hak lebih besar daripada yang dibutuhkan."
          />

          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Layers3,
                title: 'Domain first',
                text: 'Repository menangani persistence. Domain service menangani aturan bisnis dan state transition.',
              },
              {
                icon: HardDrive,
                title: 'Durable by design',
                text: 'Share accepted, outbox, idempotency, dan recovery dirancang untuk menghadapi retry serta process crash.',
              },
              {
                icon: WalletCards,
                title: 'Wallet isolation',
                text: 'Wallet hanya menandatangani dan broadcast transaksi. Saldo user hanya berubah melalui ledger journal.',
              },
              {
                icon: LockKeyhole,
                title: 'Private operations',
                text: 'Owner access memakai autentikasi kuat, audit log, step-up verification, dan jaringan terbatas.',
              },
            ].map(({ icon: Icon, title, text }) => (
              <article
                key={title}
                className="rounded-2xl border border-white/9 bg-[#0a1928]/70 p-6"
              >
                <Icon size={21} className="text-[#98f5ff]" />
                <h3 className="display-font mt-7 text-xl font-extrabold tracking-[-0.025em] text-white">
                  {title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-[#a7b9c7]">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="relative py-24 sm:py-30">
        <div className="landing-grid absolute inset-0 opacity-25" />
        <div className="relative mx-auto grid max-w-[1380px] gap-12 px-5 sm:px-8 lg:grid-cols-[0.75fr_1.25fr]">
          <SectionHeading
            eyebrow="FAQ"
            title="Pertanyaan sebelum menghubungkan perangkat."
            description="Landing page menjelaskan batas produk saat ini agar pengguna tidak mengira platform telah menerima dana atau ASIC produksi."
          />
          <div className="space-y-3">
            {[
              [
                'Apakah ini layanan cloud mining?',
                'Tidak. Platform tidak menjual kontrak hashrate. Mining dilakukan oleh perangkat fisik yang terhubung melalui Stratum.',
              ],
              [
                'Apakah hardware dibatasi ke ASIC?',
                'Tidak. Model worker mendukung CPU, GPU, FPGA, ASIC, rig hybrid, dan perangkat lain. Pipeline aktif saat ini tetap BTC/SHA-256, sehingga miner harus mendukung algoritma tersebut.',
              ],
              [
                'Apakah perangkat produksi sudah dapat dihubungkan?',
                'Belum. Upstream gateway lokal sudah tersedia, tetapi provider fixture, autentikasi produksi, integration test, load test, dan deployment verification masih menjadi blocker.',
              ],
              [
                'Apakah reward dan payout sudah aktif?',
                'Belum. Reward final, ledger settlement, Bitcoin wallet, dan payout nyata tetap dinonaktifkan sampai pipeline share tervalidasi.',
              ],
              [
                'Apa fungsi simulator?',
                'Simulator memperkirakan reward, listrik, fee, dan profit bersih. Hasilnya tidak memengaruhi saldo atau proses mining nyata.',
              ],
              [
                'Data apa yang akan tampil di dashboard?',
                'Hashrate, status worker, accepted dan rejected share, uptime, serta telemetry perangkat jika agent monitoring tersedia.',
              ],
            ].map(([question, answer]) => (
              <details
                key={question}
                className="group rounded-2xl border border-white/9 bg-[#091827]/72 p-5 open:border-[#98f5ff]/22 open:bg-[#0b1b2b] sm:p-6"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-5 font-bold text-[#edf6fa]">
                  {question}
                  <span className="mono-font text-lg text-[#d7ff63] transition group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-4 max-w-3xl text-sm leading-7 text-[#a8bac8]">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-20 sm:px-8 sm:pb-28">
        <div className="relative mx-auto max-w-[1380px] overflow-hidden rounded-[28px] border border-[#d7ff63]/22 bg-[#0a1928] px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
          <div className="landing-grid absolute inset-0 opacity-35" />
          <div className="absolute -right-24 -top-40 size-96 rounded-full bg-[#d7ff63]/10 blur-3xl" />
          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mono-font text-[10px] font-bold uppercase tracking-[0.18em] text-[#d7ff63]">
                Development access
              </p>
              <h2 className="display-font mt-4 max-w-4xl text-4xl font-black uppercase leading-[0.96] tracking-[-0.05em] text-white sm:text-5xl lg:text-6xl">
                Dashboard siap menjadi permukaan data pipeline.
              </h2>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-[#acbdca] sm:text-base">
                Gunakan halaman ini sebagai fondasi visual. Implementasi berikutnya tetap berfokus
                pada upstream compatibility dan durable share intake.
              </p>
            </div>
            <Link
              href={developmentDashboardEnabled ? '/dashboard' : '/transparency'}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#d7ff63] px-6 py-3.5 text-sm font-extrabold text-[#06111f] transition hover:bg-[#e4ff91]"
            >
              {developmentDashboardEnabled ? 'Buka Dashboard Dev' : 'Lihat Status Alpha'}{' '}
              <ArrowUpRight size={17} />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="mono-font text-[10px] font-bold uppercase tracking-[0.2em] text-[#d7ff63]">
        {eyebrow}
      </p>
      <h2 className="display-font mt-4 text-[clamp(2.45rem,5vw,5.25rem)] font-black uppercase leading-[0.94] tracking-[-0.055em] text-[#f5fbff]">
        {title}
      </h2>
      <p className="mt-6 max-w-2xl text-sm leading-7 text-[#aebfcb] sm:text-base">{description}</p>
    </div>
  );
}
