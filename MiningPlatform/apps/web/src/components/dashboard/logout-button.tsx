/** MiningPlatform — Author: Abia Nugrahanto */
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiRequest } from '@/services/api-client';

export function LogoutButton() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function logout() {
    setSubmitting(true);
    await apiRequest('/auth/logout', { method: 'POST', body: '{}' }).catch(() => undefined);
    router.replace('/login');
    router.refresh();
  }

  return (
    <button
      type="button"
      disabled={submitting}
      onClick={() => void logout()}
      className="mt-8 w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm text-[var(--muted)] hover:bg-white/5 hover:text-white disabled:opacity-50"
    >
      {submitting ? 'Keluar…' : 'Logout'}
    </button>
  );
}
