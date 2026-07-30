import Link from 'next/link';

const links = [
  ['Fitur', '#features'],
  ['Cara Kerja', '#how-it-works'],
  ['Statistik', '#statistics'],
  ['Simulator', '#simulator'],
  ['FAQ', '#faq'],
] as const;

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#071018]/90 backdrop-blur">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-semibold tracking-tight">
          MiningPlatform
        </Link>
        <div className="hidden items-center gap-7 text-sm text-[var(--muted)] md:flex">
          {links.map(([label, href]) => (
            <Link key={href} href={href} className="transition hover:text-white">
              {label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/login" className="px-3 py-2 text-[var(--muted)] hover:text-white">
            Masuk
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-[#04110c]"
          >
            Buat Akun
          </Link>
        </div>
      </nav>
    </header>
  );
}
