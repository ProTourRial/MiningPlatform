/** MiningPlatform — Author: Abia Nugrahanto */
import { FinancialReadinessPanel } from '@/components/dashboard/financial-readiness-panel';
import { PageShell } from '@/components/dashboard/page-shell';

export default function Page() {
  return (
    <PageShell title="Wallet & payout" description="Status kesiapan wallet orchestration, UTXO controls, approval, dan payout broadcast." eyebrow="Treasury security">
      <FinancialReadinessPanel module="wallet" />
    </PageShell>
  );
}
