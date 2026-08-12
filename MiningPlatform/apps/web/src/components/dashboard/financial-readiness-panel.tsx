/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import type { LucideIcon } from 'lucide-react';
import { CheckCircle2, CircleDashed, CircleOff, FileCheck2, Landmark, LockKeyhole, Scale, WalletCards } from 'lucide-react';

type Stage = {
  title: string;
  description: string;
  status: 'foundation' | 'planned' | 'gated';
  icon: LucideIcon;
};

const content = {
  rewards: {
    title: 'Reward accounting belum menghasilkan saldo spendable',
    description: 'Fondasi kalkulasi dan event contract tersedia, tetapi settlement, posting ledger, dan rekonsiliasi wajib lulus sebelum angka reward ditampilkan sebagai nilai finansial.',
    stages: [
      { title: 'Reward engine foundation', description: 'Strategi FOLLOW_UPSTREAM dan alokasi satoshi deterministik.', status: 'foundation', icon: FileCheck2 },
      { title: 'Settlement lifecycle', description: 'Period close, upstream reconciliation, dan liability posting.', status: 'planned', icon: Scale },
      { title: 'Spendable balance', description: 'Hanya aktif setelah ledger invariant dan reconciliation gate lulus.', status: 'gated', icon: Landmark },
    ] satisfies Stage[],
  },
  wallet: {
    title: 'Wallet orchestration dinonaktifkan dengan sengaja',
    description: 'Platform belum menyimpan private key, mengunci UTXO, membangun PSBT, atau menyiarkan transaksi. Status ini melindungi operator dari penggunaan dana sebelum kontrol keamanan selesai.',
    stages: [
      { title: 'Address policy', description: 'Receiving-address validation dan konfigurasi support address.', status: 'foundation', icon: FileCheck2 },
      { title: 'Wallet orchestration', description: 'UTXO inventory, coin selection, fee policy, dan PSBT approval.', status: 'planned', icon: WalletCards },
      { title: 'Payout broadcast', description: 'Memerlukan approval flow, reconciliation, rollback, dan operational sign-off.', status: 'gated', icon: LockKeyhole },
    ] satisfies Stage[],
  },
};

export function FinancialReadinessPanel({ module }: { module: keyof typeof content }) {
  const current = content[module];
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-amber-300/15 bg-amber-300/[0.045] p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-amber-300/8 blur-3xl" />
        <div className="relative max-w-3xl">
          <span className="mono-font inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/[0.06] px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.15em] text-amber-100"><CircleOff size={12} /> Release gated</span>
          <h2 className="display-font mt-5 text-2xl font-bold tracking-[-0.035em] text-amber-50 sm:text-3xl">{current.title}</h2>
          <p className="mt-3 text-sm leading-7 text-amber-100/65">{current.description}</p>
        </div>
      </section>

      <section className="dashboard-card rounded-3xl p-5 sm:p-7">
        <div>
          <p className="mono-font text-[9px] uppercase tracking-[0.18em] text-[#71899a]">Readiness sequence</p>
          <h3 className="mt-2 text-xl font-semibold">Activation path</h3>
        </div>
        <div className="mt-7 grid gap-4 lg:grid-cols-3">
          {current.stages.map((stage, index) => {
            const Icon = stage.icon;
            return (
              <article key={stage.title} className="dashboard-inset relative rounded-2xl p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className={`grid size-10 place-items-center rounded-xl ${stage.status === 'foundation' ? 'bg-emerald-300/10 text-emerald-200' : stage.status === 'planned' ? 'bg-[#98f5ff]/10 text-[#98f5ff]' : 'bg-amber-300/10 text-amber-200'}`}><Icon size={18} /></span>
                  <span className="mono-font text-[9px] text-[#61798b]">0{index + 1}</span>
                </div>
                <h4 className="mt-5 font-semibold">{stage.title}</h4>
                <p className="mt-2 min-h-16 text-xs leading-5 text-[var(--muted)]">{stage.description}</p>
                <div className="mt-5 flex items-center gap-2 border-t border-white/8 pt-4 text-[9px] font-semibold uppercase tracking-[0.12em]">
                  {stage.status === 'foundation' ? <CheckCircle2 size={13} className="text-emerald-200" /> : <CircleDashed size={13} className={stage.status === 'planned' ? 'text-[#98f5ff]' : 'text-amber-200'} />}
                  <span className={stage.status === 'foundation' ? 'text-emerald-100' : stage.status === 'planned' ? 'text-[#bdeff4]' : 'text-amber-100'}>{stage.status}</span>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
