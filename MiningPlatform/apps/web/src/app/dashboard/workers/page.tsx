/** MiningPlatform — Author: Abia Nugrahanto */
import { PageShell } from '@/components/dashboard/page-shell';
import { WorkerManagementPanel } from '@/components/dashboard/worker-management-panel';

export default function Page() {
  return (
    <PageShell title="Workers" description="Daftarkan worker, lihat status, dan rotasi kredensial Stratum produksi.">
      <WorkerManagementPanel />
    </PageShell>
  );
}
