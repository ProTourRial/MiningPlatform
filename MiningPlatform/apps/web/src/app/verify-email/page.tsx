/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Suspense } from 'react';
import { VerifyEmailForm } from '@/components/auth/account-action-forms';
import { AuthCard } from '@/components/ui/auth-card';

export default function Page() { return <AuthCard title="Verifikasi email" description="Aktifkan akun sebelum membuat session produksi."><Suspense fallback={<p>Memuat…</p>}><VerifyEmailForm /></Suspense></AuthCard>; }
