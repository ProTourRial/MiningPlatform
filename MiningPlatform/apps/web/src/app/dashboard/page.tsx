/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { PageShell } from '@/components/dashboard/page-shell';
import { RealtimeMiningPanel } from '@/components/dashboard/realtime-mining-panel';
import { BitcoinRewardFeed } from '@/components/dashboard/bitcoin-reward-feed';

export default function DashboardPage() {
  return (
    <PageShell title="Overview" description="Ringkasan pipeline mining, worker, hashrate, reward, dan payout.">
      <RealtimeMiningPanel />
      <div className="mt-6"><BitcoinRewardFeed /></div>
    </PageShell>
  );
}
