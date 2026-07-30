'use client';

import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { HashrateUpdatedPayload, MinerSessionAuthorizedPayload, MinerSessionDisconnectedPayload } from '@mining/shared';

const DEVELOPMENT_WORKER_ID = 'dev-7d9a4df2e77952c0657de069';

interface WorkerSnapshot {
  id: string;
  name: string;
  status: string;
  hashrate5m: string;
  acceptedShares5m: number;
  rejectedShares5m: number;
  recordedAt: string | null;
}

function formatHashrate(value: string): string {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '0 H/s';
  const units = ['H/s', 'KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s'];
  let scaled = number;
  let unit = 0;
  while (scaled >= 1_000 && unit < units.length - 1) {
    scaled /= 1_000;
    unit += 1;
  }
  return `${scaled.toFixed(scaled >= 100 ? 0 : 2)} ${units[unit]}`;
}

export function RealtimeMiningPanel() {
  const [connected, setConnected] = useState(false);
  const [workerStatus, setWorkerStatus] = useState('OFFLINE');
  const [hashrate, setHashrate] = useState('0');
  const [acceptedShares, setAcceptedShares] = useState(0);
  const [rejectedShares, setRejectedShares] = useState(0);
  const [recordedAt, setRecordedAt] = useState<string | null>(null);

  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
    void fetch(`${apiBase}/monitoring/development/workers/${DEVELOPMENT_WORKER_ID}/snapshot`)
      .then((response) => (response.ok ? response.json() as Promise<WorkerSnapshot> : null))
      .then((snapshot) => {
        if (!snapshot) return;
        setWorkerStatus(snapshot.status);
        setHashrate(snapshot.hashrate5m);
        setAcceptedShares(snapshot.acceptedShares5m);
        setRejectedShares(snapshot.rejectedShares5m);
        setRecordedAt(snapshot.recordedAt);
      })
      .catch(() => undefined);

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:4000/mining';
    const socket = io(socketUrl, { transports: ['websocket'], withCredentials: true });
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('hashrate.updated', (payload: HashrateUpdatedPayload) => {
      if (payload.workerId !== DEVELOPMENT_WORKER_ID) return;
      setHashrate(payload.hashesPerSecond);
      setAcceptedShares(payload.acceptedShares);
      setRejectedShares(payload.rejectedShares);
      setRecordedAt(payload.recordedAt);
    });
    socket.on('worker.online', (payload: MinerSessionAuthorizedPayload) => {
      if (payload.workerId === DEVELOPMENT_WORKER_ID) setWorkerStatus('ONLINE');
    });
    socket.on('worker.offline', (payload: MinerSessionDisconnectedPayload) => {
      if (payload.workerId === DEVELOPMENT_WORKER_ID) setWorkerStatus('OFFLINE');
    });
    return () => socket.disconnect();
  }, []);

  const cards = [
    ['Worker', workerStatus],
    ['Hashrate 5 Menit', formatHashrate(hashrate)],
    ['Accepted Share', acceptedShares.toString()],
    ['Rejected Share', rejectedShares.toString()],
  ];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Pipeline Mining Realtime</h2>
          <p className="text-sm text-[var(--muted)]">Data pengembangan dari Stratum, Redis Stream, mining worker, dan WebSocket.</p>
        </div>
        <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-[var(--muted)]">
          WebSocket {connected ? 'terhubung' : 'terputus'}
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <article key={label} className="rounded-2xl border border-white/10 bg-[var(--surface)] p-5">
            <p className="text-sm text-[var(--muted)]">{label}</p>
            <p className="mt-3 text-2xl font-semibold">{value}</p>
          </article>
        ))}
      </div>
      <p className="text-xs text-[var(--muted)]">
        Pembaruan terakhir: {recordedAt ? new Date(recordedAt).toLocaleString('id-ID') : 'belum ada share tervalidasi'}
      </p>
    </section>
  );
}
