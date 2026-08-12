/** MiningPlatform — Author: Abia Nugrahanto */
'use client';

import type { FormEvent} from 'react';
import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '@/services/api-client';

interface Channel { id: string; type: string; status: string; events: string[]; destinationFingerprint: string; createdAt: string; }
const eventOptions = ['SECURITY', 'WORKER', 'REWARD', 'PAYOUT', 'SYSTEM'];

export function NotificationSettingsPanel() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const load = useCallback(async () => { try { setChannels(await apiRequest<Channel[]>('/notifications/channels')); } catch { setError('Kanal notifikasi tidak dapat dimuat.'); } }, []);
  useEffect(() => {
  let ignore = false;

  void apiRequest<Channel[]>('/notifications/channels')
    .then((result) => {
      if (!ignore) {
        setChannels(result);
      }
    })
    .catch(() => {
      if (!ignore) {
        setError('Kanal notifikasi tidak dapat dimuat.');
      }
    });

  return () => {
    ignore = true;
  };
}, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined); setMessage(undefined);
    const data = new FormData(event.currentTarget);
    try {
      await apiRequest('/notifications/channels', { method: 'POST', body: JSON.stringify({ type: data.get('type'), destination: data.get('destination'), events: data.getAll('events') }) });
      event.currentTarget.reset();
      setMessage('Kanal disimpan dalam keadaan pending verification. Delivery adapter belum diaktifkan pada alpha ini.');
      await load();
    } catch { setError('Kanal gagal disimpan. Pilih sedikitnya satu event.'); }
  }

  async function disable(id: string) { try { await apiRequest(`/notifications/channels/${id}`, { method: 'DELETE' }); await load(); } catch { setError('Kanal gagal dinonaktifkan.'); } }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="space-y-4 rounded-2xl border border-white/10 bg-[var(--surface)] p-5">
        <div className="grid gap-3 md:grid-cols-[180px_1fr]"><select name="type" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">{['EMAIL', 'TELEGRAM', 'DISCORD', 'WEBHOOK'].map((type) => <option key={type}>{type}</option>)}</select><input name="destination" required minLength={3} placeholder="Email, chat ID, atau URL webhook" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3" /></div>
        <fieldset><legend className="text-sm text-[var(--muted)]">Event</legend><div className="mt-2 flex flex-wrap gap-3">{eventOptions.map((item) => <label key={item} className="rounded-lg border border-white/10 px-3 py-2 text-xs"><input type="checkbox" name="events" value={item} className="mr-2" />{item}</label>)}</div></fieldset>
        <button className="rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-[#04110c]">Simpan kanal</button>
      </form>
      <div className="space-y-3">{channels.map((channel) => <article key={channel.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[var(--surface)] p-5 text-sm"><div><p className="font-semibold">{channel.type} · {channel.status}</p><p className="mt-1 text-xs text-[var(--muted)]">Tujuan fingerprint {channel.destinationFingerprint}</p><p className="mt-2 text-xs text-[var(--muted)]">{channel.events.join(', ')}</p></div>{channel.status !== 'DISABLED' && <button onClick={() => void disable(channel.id)} className="rounded-lg border border-white/10 px-3 py-2 text-xs">Nonaktifkan</button>}</article>)}</div>
      {message && <p className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-sm text-amber-100">{message}</p>}
      {error && <p className="rounded-xl border border-red-300/20 bg-red-300/5 p-3 text-sm text-red-100">{error}</p>}
    </div>
  );
}
