/** MiningPlatform — Author: Abia Nugrahanto */
import { RegisterForm } from '@/components/auth/register-form';
import { AuthCard } from '@/components/ui/auth-card';

export default function RegisterPage() {
  return (
    <AuthCard
      title="Buat akun"
      description="Akun Control Plane digunakan untuk mendaftarkan worker dan memantau share."
    >
      <RegisterForm />
    </AuthCard>
  );
}
