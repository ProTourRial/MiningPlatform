/** MiningPlatform — Author: Abia Nugrahanto */
import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/login-form';
import { AuthCard } from '@/components/ui/auth-card';

export default function LoginPage() {
  return (
    <AuthCard title="Masuk ke Control Plane" description="Gunakan akun MiningPlatform untuk mengakses operasi worker, monitoring, dan keamanan.">
      <Suspense fallback={<p className="text-sm text-[var(--muted)]">Menyiapkan formulir aman…</p>}>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
