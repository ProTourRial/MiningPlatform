import { PageShell } from '@/components/dashboard/page-shell';

export default function DashboardPage() {
  return (
    <PageShell title="Overview" description="Ringkasan pool, worker, hashrate, reward, dan payout.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ['Worker Online', '0'],
          ['Hashrate', '0 TH/s'],
          ['Pending Reward', '0 BTC'],
          ['Available Balance', '0 BTC'],
        ].map(([label, value]) => (
          <article key={label} className="rounded-2xl border border-white/10 bg-[var(--surface)] p-5">
            <p className="text-sm text-[var(--muted)]">{label}</p>
            <p className="mt-3 text-2xl font-semibold">{value}</p>
          </article>
        ))}
      </div>
    </PageShell>
  );
}
