import type { ReactNode } from 'react';
import { Activity, ArrowLeft, CheckCircle2, Network, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

const assurances = [
  'Session rotation dan replay protection',
  'TOTP 2FA dan recovery code',
  'Role-based control plane access',
];

export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0a0d0b]">
      <div className="landing-grid pointer-events-none absolute inset-0 opacity-45" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(213,239,104,0.08),transparent_30%),radial-gradient(circle_at_82%_75%,rgba(131,215,195,0.1),transparent_28%)]" />
      <div className="relative mx-auto grid min-h-screen max-w-[1440px] lg:grid-cols-[0.9fr_1.1fr]">
        <aside className="hidden border-r border-white/10 px-12 py-12 lg:flex lg:flex-col lg:justify-between xl:px-16">
          <Link href="/" className="flex items-center gap-3" aria-label="MiningPlatform homepage">
            <span className="grid size-10 place-items-center rounded-[13px] border border-[#d5ef68]/25 bg-[#d5ef68]/10 text-[#d5ef68]">
              <Network size={19} />
            </span>
            <div>
              <p className="display-font font-bold text-white">MiningPlatform</p>
              <p className="mono-font mt-0.5 text-[8px] uppercase tracking-[0.2em] text-[#829188]">
                Operations control plane
              </p>
            </div>
          </Link>
          <div className="max-w-lg">
            <span className="mono-font inline-flex items-center gap-2 rounded-full border border-[#83d7c3]/20 bg-[#83d7c3]/8 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-[#83d7c3]">
              <Activity size={12} /> Identity & access
            </span>
            <h2 className="display-font mt-7 text-5xl font-black uppercase leading-[0.92] tracking-[-0.06em] text-white">
              Akses operasi mining dengan{' '}
              <span className="text-[#d5ef68]">kontrol yang tegas.</span>
            </h2>
            <p className="mt-6 max-w-md text-sm leading-7 text-[#a4b1a8]">
              Kelola worker, telemetry, API key, dan security posture dari satu workspace yang dapat
              diaudit.
            </p>
            <div className="mt-8 space-y-3">
              {assurances.map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm text-[#c3cec5]">
                  <CheckCircle2 size={16} className="text-[#d5ef68]" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 border-t border-white/10 pt-6 text-[10px] text-[#718077]">
            <ShieldCheck size={14} />
            <span>Control Plane v0.3.0-alpha.7 · Proprietary preview</span>
          </div>
        </aside>
        <section className="grid min-h-screen place-items-center px-5 py-10 sm:px-8 lg:px-12">
          <div className="w-full max-w-[480px]">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-xs font-semibold text-[#9aa69d] transition hover:text-white lg:hidden"
            >
              <ArrowLeft size={15} /> Kembali ke beranda
            </Link>
            <div className="mt-6 rounded-[28px] border border-white/12 bg-[#151b17]/92 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-8 lg:mt-0">
              <Link
                href="/"
                className="hidden items-center gap-2 text-xs font-semibold text-[#9aa69d] transition hover:text-white lg:inline-flex"
              >
                <ArrowLeft size={15} /> Beranda
              </Link>
              <p className="mono-font mt-7 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#d5ef68]">
                Secure workspace
              </p>
              <h1 className="display-font mt-3 text-3xl font-bold tracking-[-0.045em] text-white sm:text-4xl">
                {title}
              </h1>
              <p className="mt-3 text-sm leading-6 text-[#a9b6ac]">{description}</p>
              <div className="mt-7">{children}</div>
            </div>
            <p className="mono-font mt-5 text-center text-[8px] uppercase tracking-[0.15em] text-[#5d6c63]">
              Protected by secure httpOnly session cookies
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
