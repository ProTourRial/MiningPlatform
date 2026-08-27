import { ArrowLeft, Database, LockKeyhole, Radio, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

const metrics = [
  ['Total hashrate pool', 'Belum tersedia', 'Accepted-share basis'],
  ['Worker aktif', 'Belum tersedia', 'Aggregate only'],
  ['Reward hari ini', 'Belum tersedia', 'Settlement gated'],
  ['Total payout', 'Dinonaktifkan', 'Wallet boundary'],
  ['Status upstream', 'Development', 'Provider fixture pending'],
  ['Uptime server', 'Belum tersedia', 'Telemetry pending'],
] as const;

export default function TransparencyPage() {
  return (
    <main className="min-h-screen bg-[#0a0d0b] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-[1180px]">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#a9b6ac] transition hover:text-[#d5ef68]"
        >
          <ArrowLeft size={16} /> Beranda
        </Link>
        <div className="mt-16 grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
          <div>
            <p className="eyebrow">Public status / v0.3 alpha</p>
            <h1 className="display-font mt-4 text-[clamp(3rem,7vw,6.5rem)] font-black uppercase leading-[0.88] tracking-[-0.07em] text-white">
              Transparansi <span className="text-[#d5ef68]">platform.</span>
            </h1>
          </div>
          <p className="max-w-xl text-base leading-8 text-[#aab7ad]">
            Statistik publik hanya menampilkan data agregat dan tertunda. Informasi privat miner,
            lokasi farm, kredensial, private key, serta saldo individu tidak dipublikasikan.
          </p>
        </div>
        <div className="mt-16 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.map(([label, value, note]) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-[#111713]/82 p-6">
              <p className="mono-font text-[9px] font-bold uppercase tracking-[0.15em] text-[#718077]">
                {label}
              </p>
              <p className="mt-5 text-2xl font-black tracking-[-0.04em] text-white">{value}</p>
              <p className="mt-2 text-xs text-[#8f9d93]">{note}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-[#83d7c3]/16 bg-[#83d7c3]/[0.045] p-5">
            <Radio className="text-[#83d7c3]" size={19} />
            <p className="mt-4 text-sm font-bold text-white">Gateway status</p>
            <p className="mt-2 text-sm leading-6 text-[#a6b5ab]">
              Development connector aktif secara lokal; upstream produksi belum dinyatakan ready.
            </p>
          </div>
          <div className="rounded-2xl border border-[#d5ef68]/16 bg-[#d5ef68]/[0.045] p-5">
            <Database className="text-[#d5ef68]" size={19} />
            <p className="mt-4 text-sm font-bold text-white">Data boundary</p>
            <p className="mt-2 text-sm leading-6 text-[#a6b5ab]">
              Share dan event harus durable sebelum digunakan untuk agregasi atau settlement.
            </p>
          </div>
          <div className="rounded-2xl border border-[#f1c27d]/16 bg-[#f1c27d]/[0.045] p-5">
            <LockKeyhole className="text-[#f1c27d]" size={19} />
            <p className="mt-4 text-sm font-bold text-white">Privacy boundary</p>
            <p className="mt-2 text-sm leading-6 text-[#a6b5ab]">
              Data privat miner tidak menjadi bagian dari tampilan publik.
            </p>
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#111713]/72 p-5 text-sm leading-7 text-[#a9b6ac] sm:flex-row sm:items-start sm:p-6">
          <ShieldCheck className="mt-1 shrink-0 text-[#83d7c3]" size={18} />
          <p>
            <strong className="text-white">Catatan rilis.</strong> Payout, wallet signing, user
            deposit, dan reward final tetap dinonaktifkan sampai settlement invariant, approval,
            reconciliation, dan integration test selesai.
          </p>
        </div>
      </div>
    </main>
  );
}
