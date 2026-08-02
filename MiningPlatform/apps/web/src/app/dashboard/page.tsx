/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { PageShell } from '@/components/dashboard/page-shell';
import { OverviewPanel } from '@/components/dashboard/control-plane/overview-panel';

export default function DashboardPage() {
  return <PageShell title="Overview" description="Ringkasan worker, hashrate, upstream pool, service health, dan audit event."><OverviewPanel /></PageShell>;
}
