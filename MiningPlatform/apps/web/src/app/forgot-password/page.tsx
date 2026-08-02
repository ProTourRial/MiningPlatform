/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { ForgotPasswordForm } from '@/components/auth/account-action-forms';
import { AuthCard } from '@/components/ui/auth-card';

export default function Page() { return <AuthCard title="Lupa password" description="Token reset bersifat sekali pakai dan memiliki masa berlaku terbatas."><ForgotPasswordForm /></AuthCard>; }
