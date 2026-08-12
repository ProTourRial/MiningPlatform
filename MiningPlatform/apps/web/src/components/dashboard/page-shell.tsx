/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import type { ReactNode } from 'react';

export function PageShell({
  title,
  description,
  eyebrow = 'Operations workspace',
  children,
}: {
  title: string;
  description: string;
  eyebrow?: string;
  children?: ReactNode;
}) {
  return (
    <section>
      <div className="max-w-4xl">
        <p className="mono-font text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">{eyebrow}</p>
        <h1 className="display-font mt-3 text-3xl font-bold tracking-[-0.04em] text-white sm:text-4xl">{title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted)] sm:text-base">{description}</p>
      </div>
      <div className="mt-8 lg:mt-10">{children ?? <EmptyState />}</div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="rounded-3xl border border-dashed border-white/12 bg-white/[0.018] p-8 text-sm text-[var(--muted)]">
      Modul telah disiapkan. Integrasi data akan diaktifkan setelah release gate terkait lulus.
    </div>
  );
}
