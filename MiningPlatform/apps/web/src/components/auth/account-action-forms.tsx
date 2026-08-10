/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

'use client';

import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/services/api-client';

export function VerifyEmailForm() {
  const search = useSearchParams();
  const [message, setMessage] = useState('');

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const data = new FormData(event.currentTarget);
    const token = data.get('token');

    try {
      await apiFetch(
        '/auth/verify-email',
        {
          method: 'POST',
          body: JSON.stringify({ token }),
        },
        false,
      );

      setMessage(
        'Email berhasil diverifikasi. Anda dapat login.',
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Verifikasi gagal',
      );
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4"
    >
      <label className="block text-sm">
        Token verifikasi

        <textarea
          name="token"
          defaultValue={search.get('token') ?? ''}
          required
          className="mt-2 min-h-28 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 font-mono text-xs"
        />
      </label>

      <button
        type="submit"
        className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-[#04110c]"
      >
        Verifikasi email
      </button>

      {message && (
        <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
          {message}
        </p>
      )}

      <Link
        href="/login"
        className="block text-sm text-white"
      >
        Kembali ke login
      </Link>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [message, setMessage] = useState('');
  const [token, setToken] = useState<string>();

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const email = new FormData(
      event.currentTarget,
    ).get('email');

    try {
      const result = await apiFetch<{
        resetToken?: string;
      }>(
        '/auth/forgot-password',
        {
          method: 'POST',
          body: JSON.stringify({ email }),
        },
        false,
      );

      setMessage(
        'Jika akun tersedia, instruksi reset telah dikirim.',
      );

      setToken(result.resetToken);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Permintaan gagal',
      );
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4"
    >
      <label className="block text-sm">
        Email

        <input
          name="email"
          required
          type="email"
          className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3"
        />
      </label>

      <button
        type="submit"
        className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-[#04110c]"
      >
        Kirim instruksi
      </button>

      {message && (
        <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
          {message}
        </p>
      )}

      {token && (
        <Link
          href={`/reset-password?token=${encodeURIComponent(token)}`}
          className="block rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-3 text-xs text-cyan-100"
        >
          Development: buka reset password
        </Link>
      )}
    </form>
  );
}

export function ResetPasswordForm() {
  const search = useSearchParams();
  const [message, setMessage] = useState('');

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const data = new FormData(event.currentTarget);

    try {
      await apiFetch(
        '/auth/reset-password',
        {
          method: 'POST',
          body: JSON.stringify({
            token: data.get('token'),
            password: data.get('password'),
          }),
        },
        false,
      );

      setMessage(
        'Password diubah. Semua session lama telah dicabut.',
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Reset gagal',
      );
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4"
    >
      <label className="block text-sm">
        Token

        <textarea
          name="token"
          defaultValue={search.get('token') ?? ''}
          required
          className="mt-2 min-h-24 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 font-mono text-xs"
        />
      </label>

      <label className="block text-sm">
        Password baru

        <input
          name="password"
          required
          type="password"
          minLength={12}
          className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3"
        />
      </label>

      <button
        type="submit"
        className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-[#04110c]"
      >
        Reset password
      </button>

      {message && (
        <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
          {message}
        </p>
      )}
    </form>
  );
}