import { ArrowUpRight, Network, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#070a08]">
      <div className="mx-auto max-w-[1440px] px-5 py-12 sm:px-8 lg:px-10">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-sm">
            <Link href="/" className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-[13px] border border-[#d5ef68]/30 bg-[#d5ef68]/9 text-[#d5ef68]">
                <Network size={19} />
              </span>
              <span>
                <span className="display-font block text-lg font-bold tracking-[-0.04em] text-white">
                  MiningPlatform
                </span>
                <span className="mono-font mt-0.5 block text-[9px] uppercase tracking-[0.18em] text-[#7f8d83]">
                  Operations control plane
                </span>
              </span>
            </Link>
            <p className="mt-5 text-sm leading-7 text-[#8f9d93]">
              Infrastruktur mining yang dapat ditelusuri dari worker hingga pipeline settlement.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-12 gap-y-3 text-sm text-[#abb7ae] sm:grid-cols-3">
            <div className="space-y-3">
              <p className="mono-font text-[9px] font-bold uppercase tracking-[0.16em] text-[#65736a]">
                Explore
              </p>
              <Link className="block transition-colors hover:text-[#d5ef68]" href="#platform">
                Platform
              </Link>
              <Link className="block transition-colors hover:text-[#d5ef68]" href="#pipeline">
                Pipeline
              </Link>
              <Link className="block transition-colors hover:text-[#d5ef68]" href="#monitoring">
                Monitoring
              </Link>
            </div>
            <div className="space-y-3">
              <p className="mono-font text-[9px] font-bold uppercase tracking-[0.16em] text-[#65736a]">
                Product
              </p>
              <Link className="block transition-colors hover:text-[#d5ef68]" href="#simulator">
                Simulator
              </Link>
              <Link className="block transition-colors hover:text-[#d5ef68]" href="/transparency">
                Transparansi <ArrowUpRight className="inline" size={12} />
              </Link>
              <Link className="block transition-colors hover:text-[#d5ef68]" href="/login">
                Masuk
              </Link>
            </div>
            <div className="col-span-2 space-y-3 sm:col-span-1">
              <p className="mono-font text-[9px] font-bold uppercase tracking-[0.16em] text-[#65736a]">
                Status
              </p>
              <p className="flex items-center gap-2 text-[#f1c27d]">
                <span className="size-1.5 rounded-full bg-[#f1c27d]" /> Internal alpha
              </p>
              <p className="flex items-center gap-2 text-[#83d7c3]">
                <ShieldCheck size={14} /> Private development repo
              </p>
            </div>
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-white/8 pt-6 text-[11px] leading-5 text-[#66756b] sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Abia Nugrahanto. All rights reserved.</p>
          <p>Platform bukan cloud mining dan belum menerima perangkat produksi atau dana nyata.</p>
        </div>
      </div>
    </footer>
  );
}
