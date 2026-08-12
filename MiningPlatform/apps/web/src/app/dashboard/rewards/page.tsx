/** MiningPlatform — Author: Abia Nugrahanto */
import { FinancialReadinessPanel } from '@/components/dashboard/financial-readiness-panel';
import { PageShell } from '@/components/dashboard/page-shell';

export default function Page() {
  return (
    <PageShell title="Reward accounting" description="Status kesiapan reward period, settlement, ledger posting, dan rekonsiliasi upstream." eyebrow="Financial control">
      <FinancialReadinessPanel module="rewards" />
    </PageShell>
  );
}
