/** MiningPlatform — Author: Abia Nugrahanto */
import { HashrateInsightsPanel } from '@/components/dashboard/hashrate-insights-panel';
import { PageShell } from '@/components/dashboard/page-shell';

export default function Page() {
  return (
    <PageShell title="Hashrate telemetry" description="Pantau distribusi performa worker menggunakan snapshot lima menit yang tervalidasi." eyebrow="Mining intelligence">
      <HashrateInsightsPanel />
    </PageShell>
  );
}
