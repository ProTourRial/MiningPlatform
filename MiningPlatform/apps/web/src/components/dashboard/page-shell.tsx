import type { ReactNode } from 'react';

export function PageShell({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return (
    <section>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-3xl leading-7 text-[var(--muted)]">{description}</p>
      <div className="mt-8">{children ?? <EmptyState />}</div>
    </section>
  );
}

function EmptyState() {
  return <div className="rounded-2xl border border-dashed border-white/15 p-8 text-sm text-[var(--muted)]">Modul telah disiapkan. Integrasi data akan dibuat pada tahap berikutnya.</div>;
}
