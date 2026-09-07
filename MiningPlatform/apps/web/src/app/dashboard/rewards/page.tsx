/** MiningPlatform — Author: Abia Nugrahanto */
import { FinancialReadinessPanel } from '@/components/dashboard/financial-readiness-panel';
import { RewardHistoryPanel } from '@/components/dashboard/reward-history-panel';
import { PageShell } from '@/components/dashboard/page-shell';

export default function Page() {
  return (
    <PageShell
      title="Reward accounting"
      description="Status kesiapan reward period, settlement, ledger posting, dan rekonsiliasi upstream."
      eyebrow="Financial control"
    >
      <div className="space-y-6">
        <RewardHistoryPanel />
        <FinancialReadinessPanel module="rewards" />
      </div>
    </PageShell>
  );
}
