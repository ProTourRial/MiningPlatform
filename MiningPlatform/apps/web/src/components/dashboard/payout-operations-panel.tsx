'use client';

/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { CircleAlert, CircleCheck, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '@/services/api-client';

type PayoutModuleStatus = {
  status: string;
  enabled: boolean;
  gates: { requests: boolean; signing: boolean; broadcast: boolean };
  reason: string;
};

type PayoutPreference = {
  miningAccountId: string;
  username: string;
  asset: string;
  minimumPayout: string;
  selectedDestination: { addressDisplay: string; route: { status: string } } | null;
};

type PayoutRecord = {
  id: string;
  miningAccountId: string | null;
  amountAtomic: string | null;
  networkFeeAtomic: string;
  requestSource: string;
  status: string;
  transactionId: string | null;
  failureCode: string | null;
  requestedAt: string;
  completedAt: string | null;
  asset: { symbol: string; decimals: number };
  payoutAddress: {
    label: string | null;
    addressDisplay: string;
    addressFingerprint: string;
  };
  payoutRoute: {
    routeKey: string;
    version: number;
    status: string;
    requiredConfirmations: number;
  };
  eligibility: {
    availableBalanceAtomic: string;
    reservationAmountAtomic: string;
    eligible: boolean;
    blockers: string[];
    evaluatedAt: string;
  } | null;
  reservation: { amountAtomic: string; status: string; createdAt: string } | null;
  approvals: Array<{
    decision: string;
    reason: string;
    createdAt: string;
    actor: { role: string };
  }>;
};

type PayoutListResponse = { payouts: PayoutRecord[] };

function formatAtomic(value: string | null, decimals: number): string {
  if (!value) return '—';
  const negative = value.startsWith('-');
  const digits = negative ? value.slice(1) : value;
  const padded = digits.padStart(decimals + 1, '0');
  const integer = padded.slice(0, -decimals) || '0';
  const fraction = decimals ? padded.slice(-decimals).replace(/0+$/, '') : '';
  return `${negative ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`;
}

function statusTone(status: string): string {
  if (status === 'COMPLETED') return 'border-emerald-300/20 text-emerald-100';
  if (['FAILED', 'CANCELLED'].includes(status)) return 'border-red-300/20 text-red-100';
  if (['BROADCAST', 'CONFIRMING'].includes(status)) return 'border-cyan-300/20 text-cyan-100';
  return 'border-amber-300/20 text-amber-100';
}

export function PayoutOperationsPanel() {
  const [moduleStatus, setModuleStatus] = useState<PayoutModuleStatus>();
  const [preferences, setPreferences] = useState<PayoutPreference[]>([]);
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [miningAccountId, setMiningAccountId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const [statusValue, preferenceValues, payoutValues] = await Promise.all([
        apiRequest<PayoutModuleStatus>('/payouts/status'),
        apiRequest<PayoutPreference[]>('/payouts/preferences'),
        apiRequest<PayoutListResponse>('/payouts'),
      ]);
      setModuleStatus(statusValue);
      setPreferences(preferenceValues);
      setPayouts(payoutValues.payouts);
      setMiningAccountId((current) => current || preferenceValues[0]?.miningAccountId || '');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Status payout gagal dimuat');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const requestGateOpen = Boolean(moduleStatus?.enabled && moduleStatus.gates.requests);
  const selectedPreference = useMemo(
    () => preferences.find((preference) => preference.miningAccountId === miningAccountId),
    [miningAccountId, preferences],
  );

  async function requestPayout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requestGateOpen) return;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const payout = await apiRequest<PayoutRecord>('/payouts/requests', {
        method: 'POST',
        headers: { 'idempotency-key': `web:${crypto.randomUUID()}` },
        body: JSON.stringify({ miningAccountId, amountAtomic: data.get('amountAtomic') }),
      });
      setNotice(
        payout.eligibility?.eligible
          ? 'Permintaan lolos eligibility dan saldo telah direservasi untuk review.'
          : `Permintaan ditolak secara aman: ${
              payout.eligibility?.blockers.join(', ') || payout.failureCode || 'eligibility gagal'
            }`,
      );
      form.reset();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Permintaan payout gagal');
    } finally {
      setBusy(false);
    }
  }

  async function cancelPayout(payout: PayoutRecord) {
    const reason = window.prompt(
      'Alasan pembatalan (minimal 10 karakter)',
      'Dibatalkan oleh pengguna sebelum approval',
    );
    if (!reason) return;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await apiRequest(`/payouts/${payout.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setNotice('Payout dibatalkan; reservation dilepas melalui reversal journal baru.');
      await load();
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : 'Payout gagal dibatalkan');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="dashboard-card rounded-3xl p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mono-font text-[9px] uppercase tracking-[0.18em] text-[#71899a]">
            Controlled execution v2
          </p>
          <h2 className="mt-2 text-xl font-semibold">Payout execution & history</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            Status berasal langsung dari API. Mainnet tetap nonaktif; hanya environment regtest yang
            dapat membuka request, signing, dan broadcast setelah kontrol database ikut lolos.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || busy}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {moduleStatus && (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {Object.entries(moduleStatus.gates).map(([gate, enabled]) => (
            <div key={gate} className="dashboard-inset flex items-center gap-3 rounded-2xl p-4">
              {enabled ? (
                <CircleCheck size={17} className="text-emerald-200" />
              ) : (
                <CircleAlert size={17} className="text-amber-200" />
              )}
              <div>
                <p className="text-xs font-semibold uppercase">{gate}</p>
                <p className="mt-1 text-[10px] text-[var(--muted)]">
                  {enabled ? 'Environment gate ON' : 'Environment gate OFF'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {(error || notice) && (
        <p
          role="status"
          className={`mt-5 rounded-xl border p-3 text-sm ${
            error
              ? 'border-red-300/20 bg-red-300/5 text-red-100'
              : 'border-emerald-300/20 bg-emerald-300/5 text-emerald-100'
          }`}
        >
          {error ?? notice}
        </p>
      )}

      <form onSubmit={requestPayout} className="mt-6 rounded-2xl border border-white/10 p-5">
        <div className="flex items-center gap-3">
          <ShieldCheck size={18} className="text-cyan-100" />
          <h3 className="font-semibold">Permintaan manual</h3>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
          <select
            value={miningAccountId}
            onChange={(event) => setMiningAccountId(event.target.value)}
            aria-label="Mining account"
            className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm"
          >
            {preferences.map((preference) => (
              <option key={preference.miningAccountId} value={preference.miningAccountId}>
                {preference.username} · {preference.asset}
              </option>
            ))}
          </select>
          <input
            name="amountAtomic"
            required
            inputMode="numeric"
            pattern="[1-9][0-9]{0,18}"
            placeholder="Jumlah atomic / satoshi"
            aria-label="Jumlah payout atomic"
            className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 font-mono text-sm"
          />
          <button
            disabled={!requestGateOpen || !miningAccountId || busy}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-bold text-[#04110c] disabled:opacity-40"
          >
            <Send size={15} /> Ajukan payout
          </button>
        </div>
        <p className="mt-3 text-xs text-[var(--muted)]">
          {requestGateOpen
            ? `Minimum akun ${selectedPreference?.minimumPayout ?? '—'} ${
                selectedPreference?.asset ?? ''
              }; tujuan ${
                selectedPreference?.selectedDestination?.addressDisplay ?? 'belum dipilih'
              }.`
            : 'Form dikunci karena environment request gate OFF. Mengaktifkan UI tidak dapat melewati kontrol backend.'}
        </p>
      </form>

      <div className="mt-7 grid gap-3">
        {payouts.map((payout) => (
          <article key={payout.id} className="dashboard-inset rounded-2xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] ${statusTone(
                      payout.status,
                    )}`}
                  >
                    {payout.status}
                  </span>
                  <span className="font-mono text-xs text-[var(--muted)]">{payout.id}</span>
                </div>
                <p className="mt-3 text-lg font-semibold">
                  {formatAtomic(payout.amountAtomic, payout.asset.decimals)} {payout.asset.symbol}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {payout.payoutAddress.addressDisplay} · {payout.payoutRoute.routeKey} v
                  {payout.payoutRoute.version} ·{' '}
                  {new Date(payout.requestedAt).toLocaleString('id-ID')}
                </p>
              </div>
              {['QUEUED', 'REVIEW'].includes(payout.status) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void cancelPayout(payout)}
                  className="rounded-lg border border-red-300/20 px-3 py-2 text-xs text-red-100 disabled:opacity-40"
                >
                  Batalkan
                </button>
              )}
            </div>

            {payout.eligibility && (
              <div className="mt-4 rounded-xl border border-white/8 p-3 text-xs">
                <p className={payout.eligibility.eligible ? 'text-emerald-100' : 'text-amber-100'}>
                  Eligibility: {payout.eligibility.eligible ? 'LOLOS' : 'TERBLOKIR'} · available{' '}
                  {formatAtomic(payout.eligibility.availableBalanceAtomic, payout.asset.decimals)}{' '}
                  {payout.asset.symbol}
                </p>
                {payout.eligibility.blockers.length > 0 && (
                  <p className="mt-2 break-words text-amber-100/70">
                    {payout.eligibility.blockers.join(' · ')}
                  </p>
                )}
              </div>
            )}

            <div className="mt-4 grid gap-2 text-[11px] text-[var(--muted)] sm:grid-cols-3">
              <span>Reservation: {payout.reservation?.status ?? 'NONE'}</span>
              <span>Approval: {payout.approvals.at(-1)?.decision ?? 'PENDING'}</span>
              <span className="truncate" title={payout.transactionId ?? undefined}>
                Tx: {payout.transactionId ?? 'belum dibroadcast'}
              </span>
            </div>
          </article>
        ))}
        {!loading && payouts.length === 0 && (
          <p className="rounded-2xl border border-dashed border-white/10 p-5 text-sm text-[var(--muted)]">
            Belum ada payout. Riwayat hanya menampilkan data API nyata.
          </p>
        )}
      </div>
    </section>
  );
}
