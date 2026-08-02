/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { PageShell } from '@/components/dashboard/page-shell';
import { WorkersManager } from '@/components/dashboard/control-plane/workers-manager';

export default function Page() {
  return <PageShell title="Workers" description="Worker, credential, status, dan statistik dipisahkan agar lifecycle miner tetap dapat diaudit."><WorkersManager /></PageShell>;
}
