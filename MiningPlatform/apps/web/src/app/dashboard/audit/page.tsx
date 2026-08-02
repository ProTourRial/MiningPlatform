/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { AuditLogPanel } from '@/components/dashboard/control-plane/audit-log-panel';
import { PageShell } from '@/components/dashboard/page-shell';

export default function AuditPage() {
  return <PageShell title="Audit Log" description="Riwayat aktivitas akun dan operasi control plane."><AuditLogPanel /></PageShell>;
}
