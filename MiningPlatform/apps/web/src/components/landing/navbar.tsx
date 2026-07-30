'use client';

import { Menu, Network, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const links = [
  ['Platform', '#platform'],
  ['Pipeline', '#pipeline'],
  ['Monitoring', '#monitoring'],
  ['Simulator', '#simulator'],
  ['Transparansi', '#transparency'],
  ['FAQ', '#faq'],
] as const;

export function Navbar() {
  const developmentDashboardEnabled = process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_ENABLE_DEVELOPMENT_DASHBOARD !== 'false';
  const [isScrolled, setIsScrolled] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b transition duration-300 ${
        isScrolled
          ? 'border-white/10 bg-[#06111f]/88 shadow-2xl shadow-black/10 backdrop-blur-xl'
          : 'border-transparent bg-transparent'
      }`}
    >
      <nav className="mx-auto flex h-18 max-w-[1380px] items-center justify-between px-5 sm:px-8">
        <Link href="/" className="group flex items-center gap-3" aria-label="MiningPlatform homepage">
          <span className="grid size-9 place-items-center rounded-xl border border-[#d7ff63]/35 bg-[#d7ff63]/10 text-[#d7ff63] transition group-hover:border-[#d7ff63]/70 group-hover:bg-[#d7ff63]/15">
            <Network size={18} strokeWidth={2.2} />
          </span>
          <span>
            <span className="display-font block text-base font-bold tracking-[-0.03em] text-white sm:text-lg">
              MiningPlatform
            </span>
            <span className="mono-font hidden text-[10px] uppercase tracking-[0.18em] text-[#9fb4c7] sm:block">
              Pool Operations Control Plane
            </span>
          </span>
        </Link>

        <div className="hidden items-center gap-7 lg:flex">
          {links.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="mono-font text-xs font-semibold uppercase tracking-[0.12em] text-[#b7c7d6] transition hover:text-[#d7ff63]"
            >
              {label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-3 sm:flex">
          <span className="mono-font rounded-full border border-[#98f5ff]/25 bg-[#98f5ff]/8 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#98f5ff]">
            Internal Alpha
          </span>
          <Link
            href="/login"
            className="rounded-lg px-3 py-2 text-sm font-semibold text-[#c8d5df] transition hover:text-white"
          >
            Masuk
          </Link>
          {developmentDashboardEnabled ? (
            <Link
              href="/dashboard"
              className="rounded-lg bg-[#d7ff63] px-4 py-2 text-sm font-bold text-[#06111f] transition hover:bg-[#e3ff91]"
            >
              Dashboard Dev
            </Link>
          ) : (
            <Link
              href="/transparency"
              className="rounded-lg border border-[#d7ff63]/30 px-4 py-2 text-sm font-bold text-[#d7ff63] transition hover:bg-[#d7ff63]/10"
            >
              Status Alpha
            </Link>
          )}
        </div>

        <button
          type="button"
          className="grid size-10 place-items-center rounded-lg border border-white/10 bg-white/5 text-white sm:hidden"
          onClick={() => setIsOpen((value: boolean) => !value)}
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Tutup navigasi' : 'Buka navigasi'}
        >
          {isOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>

      {isOpen ? (
        <div className="border-t border-white/10 bg-[#071422]/98 px-5 py-5 backdrop-blur-xl sm:hidden">
          <div className="mx-auto flex max-w-[1380px] flex-col gap-1">
            {links.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                onClick={() => setIsOpen(false)}
                className="mono-font rounded-lg px-3 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#c8d5df] hover:bg-white/5 hover:text-[#d7ff63]"
              >
                {label}
              </Link>
            ))}
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
              <Link href="/login" className="rounded-lg border border-white/12 px-4 py-3 text-center text-sm font-semibold">
                Masuk
              </Link>
              <Link
                href={developmentDashboardEnabled ? '/dashboard' : '/transparency'}
                className="rounded-lg bg-[#d7ff63] px-4 py-3 text-center text-sm font-bold text-[#06111f]"
              >
                {developmentDashboardEnabled ? 'Dashboard Dev' : 'Status Alpha'}
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
