import Link from 'next/link';
import { AuthCard } from '@/components/ui/auth-card';

export default function LoginPage() {
  return (
    <AuthCard title="Masuk" description="Autentikasi API akan dihubungkan pada tahap integrasi auth.">
      <form className="space-y-4">
        <label className="block text-sm">
          Email
          <input type="email" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-[var(--accent)]" />
        </label>
        <label className="block text-sm">
          Password
          <input type="password" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-[var(--accent)]" />
        </label>
        <button type="button" className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-[#04110c]">Masuk</button>
      </form>
      <p className="mt-5 text-sm text-[var(--muted)]">Belum punya akun? <Link href="/register" className="text-white">Daftar</Link></p>
    </AuthCard>
  );
}
