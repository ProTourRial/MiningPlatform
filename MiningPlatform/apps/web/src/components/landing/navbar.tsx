'use client';

import { ArrowUpRight, Menu, Network, X } from 'lucide-react';
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
  const developmentDashboardEnabled =
    process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_ENABLE_DEVELOPMENT_DASHBOARD !== 'false';
  const [isScrolled, setIsScrolled] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const ctaHref = developmentDashboardEnabled ? '/dashboard' : '/transparency';
  const ctaLabel = developmentDashboardEnabled ? 'Buka dashboard' : 'Lihat status';

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'border-b border-white/10 bg-[#0a0d0b]/88 shadow-2xl shadow-black/20 backdrop-blur-xl'
          : 'bg-transparent'
      }`}
    >
      <nav
        className="mx-auto flex h-[76px] max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-10"
        aria-label="Navigasi utama"
      >
        <Link
          href="/"
          className="group flex items-center gap-3"
          aria-label="MiningPlatform homepage"
        >
          <span className="grid size-10 place-items-center rounded-[13px] border border-[#d5ef68]/35 bg-[#d5ef68]/10 text-[#d5ef68] transition duration-200 group-hover:border-[#d5ef68]/70 group-hover:bg-[#d5ef68]/16">
            <Network size={19} strokeWidth={2.2} />
          </span>
          <span>
            <span className="display-font block text-[17px] font-bold tracking-[-0.04em] text-white sm:text-[19px]">
              MiningPlatform
            </span>
            <span className="mono-font hidden text-[9px] uppercase tracking-[0.2em] text-[#9aa69d] sm:block">
              Operations control plane
            </span>
          </span>
        </Link>

        <div className="hidden items-center gap-7 lg:flex">
          {links.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="mono-font text-[10px] font-semibold uppercase tracking-[0.13em] text-[#aebbb0] transition-colors hover:text-[#d5ef68]"
            >
              {label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-3 sm:flex">
          <span className="mono-font inline-flex items-center gap-2 rounded-full border border-[#f1c27d]/25 bg-[#f1c27d]/8 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[#f1c27d]">
            <span className="size-1.5 rounded-full bg-[#f1c27d]" /> Internal alpha
          </span>
          <Link
            href="/login"
            className="rounded-lg px-3 py-2 text-sm font-semibold text-[#bdc9bf] transition-colors hover:text-white"
          >
            Masuk
          </Link>
          <Link
            href={ctaHref}
            className="group inline-flex items-center gap-2 rounded-lg bg-[#d5ef68] px-4 py-2.5 text-sm font-bold text-[#0a0d0b] transition duration-200 hover:bg-[#e2f58b] active:scale-[0.97]"
          >
            {ctaLabel}
            <ArrowUpRight
              size={15}
              className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            />
          </Link>
        </div>

        <button
          type="button"
          className="grid size-10 place-items-center rounded-xl border border-white/12 bg-white/[0.045] text-white sm:hidden"
          onClick={() => setIsOpen((value) => !value)}
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Tutup navigasi' : 'Buka navigasi'}
        >
          {isOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>

      {isOpen ? (
        <div className="border-t border-white/10 bg-[#111613]/98 px-5 py-5 shadow-2xl backdrop-blur-xl sm:hidden">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-1">
            {links.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                onClick={() => setIsOpen(false)}
                className="mono-font rounded-xl px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#bdc9bf] transition-colors hover:bg-white/5 hover:text-[#d5ef68]"
              >
                {label}
              </Link>
            ))}
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
              <Link
                href="/login"
                className="rounded-xl border border-white/12 px-4 py-3 text-center text-sm font-semibold"
              >
                Masuk
              </Link>
              <Link
                href={ctaHref}
                className="rounded-xl bg-[#d5ef68] px-4 py-3 text-center text-sm font-bold text-[#0a0d0b]"
              >
                {ctaLabel}
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
