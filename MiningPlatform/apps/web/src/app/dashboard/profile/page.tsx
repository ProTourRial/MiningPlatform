/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { PageShell } from '@/components/dashboard/page-shell';
import { ProfilePanel } from '@/components/dashboard/control-plane/profile-panel';

export default function Page() { return <PageShell title="Profile" description="Identitas akun, locale, timezone, role, dan status keamanan."><ProfilePanel /></PageShell>; }
