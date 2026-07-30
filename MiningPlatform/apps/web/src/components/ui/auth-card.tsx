/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import type { ReactNode } from 'react';
import Link from 'next/link';

export function AuthCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center px-6 py-16">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-[var(--surface)] p-7">
        <Link href="/" className="text-sm text-[var(--accent)]">← Kembali</Link>
        <h1 className="mt-6 text-3xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{description}</p>
        <div className="mt-7">{children}</div>
      </section>
    </main>
  );
}
