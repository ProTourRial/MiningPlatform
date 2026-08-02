/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { AuthCard } from '@/components/ui/auth-card';
import { RegisterForm } from '@/components/auth/register-form';

export default function RegisterPage() {
  return <AuthCard title="Buat akun" description="Akun terpisah dari credential Stratum miner."><RegisterForm /></AuthCard>;
}
