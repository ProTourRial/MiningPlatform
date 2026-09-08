/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

export interface DisabledGoogleOAuthConfig {
  enabled: false;
}

export interface EnabledGoogleOAuthConfig {
  enabled: true;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  returnOrigin: string;
  attemptTtlSeconds: number;
}

export type GoogleOAuthRuntimeConfig = DisabledGoogleOAuthConfig | EnabledGoogleOAuthConfig;

function attemptTtlSeconds(): number {
  const raw = process.env.GOOGLE_OAUTH_ATTEMPT_TTL_SECONDS ?? '300';
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 120 || value > 600) {
    throw new Error('GOOGLE_OAUTH_ATTEMPT_TTL_SECONDS must be an integer between 120 and 600');
  }
  return value;
}

function exactApplicationOrigin(): string {
  const raw = process.env.APP_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000');
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('APP_URL must be an absolute HTTP(S) origin when Google OAuth is enabled');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== raw) {
    throw new Error('APP_URL must be an HTTP(S) origin without a path when Google OAuth is enabled');
  }
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw new Error('APP_URL must use HTTPS in production when Google OAuth is enabled');
  }
  if (parsed.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) {
    throw new Error('Google OAuth permits HTTP only for a loopback development origin');
  }
  return parsed.origin;
}

export function googleOAuthRuntimeConfig(): GoogleOAuthRuntimeConfig {
  if (process.env.GOOGLE_OAUTH_ENABLED !== 'true') return { enabled: false };

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() ?? '';
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ?? '';
  if (!clientId.endsWith('.apps.googleusercontent.com') || clientId.length > 255) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID must be a Google web application client ID');
  }
  if (clientSecret.length < 16 || clientSecret.length > 512) {
    throw new Error('GOOGLE_OAUTH_CLIENT_SECRET must contain a valid confidential client secret');
  }

  const returnOrigin = exactApplicationOrigin();
  return {
    enabled: true,
    clientId,
    clientSecret,
    returnOrigin,
    redirectUri: `${returnOrigin}/api/v1/auth/google/callback`,
    attemptTtlSeconds: attemptTtlSeconds(),
  };
}
