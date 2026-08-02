/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { PageShell } from '@/components/dashboard/page-shell';
import { ApiKeysPanel } from '@/components/dashboard/control-plane/api-keys-panel';

export default function Page() { return <PageShell title="API Access" description="API key menggunakan permission terbatas dan secret satu kali tampil."><ApiKeysPanel /></PageShell>; }
