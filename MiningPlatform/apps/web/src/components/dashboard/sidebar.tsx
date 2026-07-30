import Link from 'next/link';

const menu = [
  ['Overview', '/dashboard'],
  ['Workers', '/dashboard/workers'],
  ['Hashrate', '/dashboard/hashrate'],
  ['Rewards', '/dashboard/rewards'],
  ['Wallet', '/dashboard/wallet'],
  ['Profile', '/dashboard/profile'],
  ['Security', '/dashboard/security'],
  ['Settings', '/dashboard/settings'],
  ['API', '/dashboard/api'],
] as const;

export function Sidebar() {
  return (
    <aside className="border-r border-white/10 bg-[var(--surface)] p-5 lg:min-h-screen">
      <Link href="/" className="text-lg font-semibold">MiningPlatform</Link>
      <nav className="mt-8 grid gap-1">
        {menu.map(([label, href]) => (
          <Link key={href} href={href} className="rounded-lg px-3 py-2 text-sm text-[var(--muted)] hover:bg-white/5 hover:text-white">{label}</Link>
        ))}
      </nav>
    </aside>
  );
}
