/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Github, Network } from 'lucide-react';
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#050e18]">
      <div className="mx-auto max-w-[1380px] px-5 py-10 sm:px-8">
        <div className="flex flex-col gap-8 border-b border-white/9 pb-9 md:flex-row md:items-start md:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl border border-[#d7ff63]/30 bg-[#d7ff63]/9 text-[#d7ff63]">
              <Network size={18} />
            </span>
            <div>
              <p className="display-font font-extrabold tracking-[-0.025em] text-white">MiningPlatform</p>
              <p className="mono-font mt-1 text-[9px] uppercase tracking-[0.14em] text-[#71899c]">Mining pool management platform</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm text-[#9fb1bf] sm:grid-cols-4">
            <Link href="#platform" className="hover:text-white">Platform</Link>
            <Link href="#pipeline" className="hover:text-white">Pipeline</Link>
            <Link href="/transparency" className="hover:text-white">Transparansi</Link>
            <Link href="/login" className="hover:text-white">Masuk</Link>
          </div>
        </div>

        <div className="flex flex-col gap-4 pt-7 text-xs leading-5 text-[#71899b] md:flex-row md:items-center md:justify-between">
          <p>© 2026 Abia Nugrahanto. All rights reserved.</p>
          <p>Platform bukan layanan cloud mining dan belum menerima perangkat produksi atau dana nyata.</p>
          <span className="inline-flex items-center gap-2"><Github size={14} /> Private development repository</span>
        </div>
      </div>
    </footer>
  );
}
