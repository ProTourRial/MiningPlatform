/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { prisma } from '@mining/database';
import type { DomainEvent } from '@mining/event-bus';
import { decryptSecret } from '@mining/security';

interface IdentityEmailPayload {
  userId: string;
  email: string;
  tokenId: string;
}

interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required when EMAIL_PROVIDER=resend`);
  return value;
}

function applicationUrl(): URL {
  const value = required('APP_URL');
  const url = new URL(value);
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('APP_URL must use HTTPS in production email delivery');
  }
  return url;
}

export function buildIdentityEmail(
  eventName: string,
  recipient: string,
  rawToken: string,
  baseUrl: URL,
): EmailMessage {
  if (eventName === 'identity.email-verification.requested.v1') {
    const link = new URL('/verify-email', baseUrl);
    link.searchParams.set('token', rawToken);
    return {
      to: recipient,
      subject: 'Verifikasi akun MiningPlatform',
      text: `Verifikasi akun MiningPlatform melalui tautan berikut: ${link.toString()}\n\nTautan berlaku selama 24 jam.`,
      html: `<p>Verifikasi akun MiningPlatform melalui tautan berikut:</p><p><a href="${link.toString()}">Verifikasi email</a></p><p>Tautan berlaku selama 24 jam.</p>`,
    };
  }
  if (eventName === 'identity.password-reset.requested.v1') {
    const link = new URL('/reset-password', baseUrl);
    link.searchParams.set('token', rawToken);
    return {
      to: recipient,
      subject: 'Reset password MiningPlatform',
      text: `Reset password MiningPlatform melalui tautan berikut: ${link.toString()}\n\nTautan berlaku selama 1 jam. Abaikan email ini bila Anda tidak meminta reset.`,
      html: `<p>Reset password MiningPlatform melalui tautan berikut:</p><p><a href="${link.toString()}">Reset password</a></p><p>Tautan berlaku selama 1 jam. Abaikan email ini bila Anda tidak meminta reset.</p>`,
    };
  }
  throw new Error(`Unsupported identity email event: ${eventName}`);
}

async function tokenForEvent(event: DomainEvent<IdentityEmailPayload>): Promise<string> {
  const encryptionKey = required('AUTH_ENCRYPTION_KEY');
  if (event.eventName === 'identity.email-verification.requested.v1') {
    const token = await prisma.emailVerificationToken.findFirst({
      where: { id: event.payload.tokenId, userId: event.payload.userId, consumedAt: null, expiresAt: { gt: new Date() } },
      select: { tokenEncrypted: true },
    });
    if (!token?.tokenEncrypted) throw new Error('Email verification token is unavailable or expired');
    return decryptSecret(token.tokenEncrypted, encryptionKey);
  }
  const token = await prisma.passwordResetToken.findFirst({
    where: { id: event.payload.tokenId, userId: event.payload.userId, consumedAt: null, expiresAt: { gt: new Date() } },
    select: { tokenEncrypted: true },
  });
  if (!token?.tokenEncrypted) throw new Error('Password reset token is unavailable or expired');
  return decryptSecret(token.tokenEncrypted, encryptionKey);
}

async function sendWithResend(message: EmailMessage, idempotencyKey: string): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${required('RESEND_API_KEY')}`,
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey.slice(0, 256),
    },
    body: JSON.stringify({
      from: required('EMAIL_FROM'),
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const details = (await response.text()).slice(0, 1_000);
    throw new Error(`Resend email request failed with HTTP ${response.status}: ${details}`);
  }
}

export async function deliverControlPlaneEmail(event: DomainEvent): Promise<boolean> {
  const supported = new Set([
    'identity.email-verification.requested.v1',
    'identity.password-reset.requested.v1',
  ]);
  if (!supported.has(event.eventName)) return false;

  const provider = (process.env.EMAIL_PROVIDER ?? 'disabled').trim().toLowerCase();
  if (provider === 'disabled') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('EMAIL_PROVIDER must be configured for production identity email events');
    }
    return false;
  }
  if (provider !== 'resend') throw new Error(`Unsupported EMAIL_PROVIDER: ${provider}`);

  const typed = event as DomainEvent<IdentityEmailPayload>;
  if (!typed.payload?.userId || !typed.payload?.email || !typed.payload?.tokenId) {
    throw new Error(`Malformed ${event.eventName} payload`);
  }
  const rawToken = await tokenForEvent(typed);
  const message = buildIdentityEmail(event.eventName, typed.payload.email, rawToken, applicationUrl());
  await sendWithResend(message, `mining-platform/${event.eventId}`);
  return true;
}
