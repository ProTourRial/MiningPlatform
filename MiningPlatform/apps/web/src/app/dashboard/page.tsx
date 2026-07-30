import { PageShell } from '@/components/dashboard/page-shell';
import { RealtimeMiningPanel } from '@/components/dashboard/realtime-mining-panel';

export default function DashboardPage() {
  return (
    <PageShell title="Overview" description="Ringkasan pipeline mining, worker, hashrate, reward, dan payout.">
      <RealtimeMiningPanel />
    </PageShell>
  );
}
