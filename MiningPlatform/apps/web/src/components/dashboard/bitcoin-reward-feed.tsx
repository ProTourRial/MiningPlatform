/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Blocks, Clock3, Coins, ExternalLink, Pickaxe, ReceiptText } from 'lucide-react';

interface MempoolBlock {
  id: string;
  height: number;
  timestamp: number;
  tx_count: number;
  extras?: {
    totalFees?: number;
    reward?: number;
    pool?: { name?: string };
  };
}

function subsidyAtHeight(height: number) {
  const halvings = Math.floor(height / 210_000);
  if (halvings >= 64) return 0;
  return Math.floor(5_000_000_000 / 2 ** halvings);
}

function satsToBtc(value: number) {
  return (value / 100_000_000).toLocaleString('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 8,
  });
}

function relativeTime(timestamp: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp * 1_000) / 60_000));
  if (minutes < 1) return 'baru saja';
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  return `${hours} jam lalu`;
}

async function loadBlocks(): Promise<MempoolBlock[]> {
  try {
    const response = await fetch('https://mempool.space/api/v1/blocks', {
      headers: { accept: 'application/json' },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(4_500),
    });
    if (!response.ok) return [];
    const data = await response.json() as unknown;
    return Array.isArray(data) ? (data as MempoolBlock[]).slice(0, 5) : [];
  } catch {
    return [];
  }
}

export async function BitcoinRewardFeed() {
  const blocks = await loadBlocks();
  const latest = blocks[0];
  const latestFees = latest?.extras?.totalFees ?? 0;
  const latestSubsidy = latest ? subsidyAtHeight(latest.height) : 0;
  const latestReward = latest?.extras?.reward ?? latestSubsidy + latestFees;

  return (
    <section className="dashboard-card overflow-hidden rounded-3xl">
      <div className="flex flex-col justify-between gap-5 border-b border-white/8 p-5 sm:flex-row sm:items-center sm:p-6 lg:p-7">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f7931a]/10 text-[#ffae42]"><Blocks size={20} /></span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">Bitcoin Network Reward Feed</h2>
              <span className="mono-font rounded-full border border-[#98f5ff]/15 bg-[#98f5ff]/[0.055] px-2 py-1 text-[7px] font-bold uppercase tracking-[0.14em] text-[#bdeff4]">60s cache</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Blok terbaru dari jaringan publik. Ini bukan saldo atau reward yang sudah menjadi hak pengguna MiningPlatform.</p>
          </div>
        </div>
        <a href="https://mempool.space/blocks" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs font-semibold text-[#98f5ff] transition hover:text-white">Verifikasi di mempool.space <ExternalLink size={13} /></a>
      </div>

      {blocks.length ? (
        <div className="grid xl:grid-cols-[0.62fr_1.38fr]">
          <div className="border-b border-white/8 p-5 sm:p-6 xl:border-b-0 xl:border-r lg:p-7">
            <p className="mono-font text-[9px] uppercase tracking-[0.18em] text-[#71899a]">Latest block economics</p>
            <p className="display-font mt-4 text-3xl font-bold tracking-[-0.045em] text-white">{satsToBtc(latestReward)} <span className="text-base text-[#ffae42]">BTC</span></p>
            <p className="mt-2 text-xs text-[var(--muted)]">Estimasi total reward: subsidi konsensus + fee transaksi yang dilaporkan.</p>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="dashboard-inset rounded-2xl p-4"><Coins size={15} className="text-[var(--accent)]" /><p className="mt-3 text-sm font-bold">{satsToBtc(latestSubsidy)} BTC</p><p className="mt-1 text-[9px] uppercase tracking-[0.11em] text-[var(--muted)]">Block subsidy</p></div>
              <div className="dashboard-inset rounded-2xl p-4"><ReceiptText size={15} className="text-[#98f5ff]" /><p className="mt-3 text-sm font-bold">{satsToBtc(latestFees)} BTC</p><p className="mt-1 text-[9px] uppercase tracking-[0.11em] text-[var(--muted)]">Transaction fees</p></div>
            </div>
          </div>

          <div className="p-5 sm:p-6 lg:p-7">
            <div className="grid gap-3">
              {blocks.map((block, index) => {
                const subsidy = subsidyAtHeight(block.height);
                const fees = block.extras?.totalFees ?? 0;
                const reward = block.extras?.reward ?? subsidy + fees;
                return (
                  <a key={block.id} href={`https://mempool.space/block/${block.id}`} target="_blank" rel="noreferrer" className="group grid gap-3 rounded-2xl border border-white/8 bg-white/[0.018] p-4 transition hover:border-[#98f5ff]/18 hover:bg-[#98f5ff]/[0.035] sm:grid-cols-[auto_1fr_auto] sm:items-center">
                    <span className={`grid size-9 place-items-center rounded-xl ${index === 0 ? 'bg-[#f7931a]/10 text-[#ffae42]' : 'bg-white/[0.045] text-[#7890a2]'}`}><Pickaxe size={15} /></span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><p className="text-sm font-semibold">Block #{block.height.toLocaleString('en-US')}</p><span className="text-[9px] text-[#61798b]">· {block.extras?.pool?.name ?? 'Unknown pool'}</span></div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-[var(--muted)]"><span>{block.tx_count.toLocaleString('id-ID')} transaksi</span><span className="inline-flex items-center gap-1"><Clock3 size={10} /> {relativeTime(block.timestamp)}</span></div>
                    </div>
                    <div className="sm:text-right"><p className="text-sm font-bold text-[#d7edf1]">{satsToBtc(reward)} BTC</p><p className="mt-1 text-[8px] uppercase tracking-[0.1em] text-[#61798b]">Network reward</p></div>
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid min-h-44 place-items-center p-7 text-center">
          <div><Blocks className="mx-auto text-[#587286]" size={26} /><p className="mt-3 text-sm font-semibold">Feed blockchain sedang tidak tersedia</p><p className="mt-1 text-xs text-[var(--muted)]">Dashboard mining tetap berfungsi; data publik akan dicoba kembali setelah cache berikutnya.</p></div>
        </div>
      )}
    </section>
  );
}
