/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { PageShell } from '@/components/dashboard/page-shell';
import { SecurityPanel } from '@/components/dashboard/control-plane/security-panel';

export default function Page() { return <PageShell title="Security" description="Password, TOTP, backup code, dan session perangkat."><SecurityPanel /></PageShell>; }
