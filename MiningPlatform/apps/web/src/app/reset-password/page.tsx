/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Suspense } from 'react';
import { ResetPasswordForm } from '@/components/auth/account-action-forms';
import { AuthCard } from '@/components/ui/auth-card';

export default function Page() { return <AuthCard title="Reset password" description="Semua session lama dicabut setelah password berhasil diganti."><Suspense fallback={<p>Memuat…</p>}><ResetPasswordForm /></Suspense></AuthCard>; }
