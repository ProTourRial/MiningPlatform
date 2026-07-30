/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { PageShell } from '@/components/dashboard/page-shell';
import { UniversalMinerPanel } from '@/components/dashboard/universal-miner-panel';

export default function Page() {
  return (
    <PageShell
      title="Universal Workers"
      description="Worker dapat berasal dari ASIC, GPU, CPU, FPGA, atau rig hybrid selama software miner mendukung protokol dan algoritma pool yang aktif."
    >
      <UniversalMinerPanel />
    </PageShell>
  );
}
