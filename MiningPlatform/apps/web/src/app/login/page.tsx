/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Suspense } from 'react';
import { AuthCard } from '@/components/ui/auth-card';
import { LoginForm } from '@/components/auth/login-form';

export default function LoginPage() {
  return <AuthCard title="Masuk" description="Akses dashboard, worker, session, dan keamanan akun."><Suspense fallback={<p>Memuat…</p>}><LoginForm /></Suspense></AuthCard>;
}
