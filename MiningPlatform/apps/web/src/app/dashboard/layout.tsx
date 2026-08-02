/** MiningPlatform — Author: Abia Nugrahanto */
import type { ReactNode } from 'react';
import { Sidebar } from '@/components/dashboard/sidebar';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[240px_1fr]">
      <Sidebar />
      <div>
        <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <p className="text-sm text-[var(--muted)]">BTC · SHA-256 · FOLLOW_UPSTREAM</p>
          <span className="rounded-full border border-white/10 px-3 py-1 text-xs">CONTROL PLANE ALPHA</span>
        </header>
        <main className="p-6 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
