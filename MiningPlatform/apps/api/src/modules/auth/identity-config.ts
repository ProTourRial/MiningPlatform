/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

function secret(name: string, developmentFallback: string): string {
  const value = process.env[name] ?? (process.env.NODE_ENV === 'production' ? '' : developmentFallback);
  if (value.length < 32) throw new Error(`${name} must contain at least 32 characters`);
  return value;
}

export function identityConfig() {
  return {
    jwtSecret: secret('AUTH_JWT_SECRET', 'development-jwt-secret-change-before-production-2026'),
    encryptionKey: secret('AUTH_ENCRYPTION_KEY', 'development-encryption-key-change-before-production-2026'),
    backupCodePepper: secret('AUTH_BACKUP_CODE_PEPPER', 'development-backup-pepper-change-before-production-2026'),
    issuer: process.env.AUTH_JWT_ISSUER ?? 'MiningPlatform',
    audience: process.env.AUTH_JWT_AUDIENCE ?? 'MiningPlatformWeb',
    accessTtlSeconds: Number(process.env.AUTH_ACCESS_TTL_SECONDS ?? 900),
    refreshTtlSeconds: Number(process.env.AUTH_REFRESH_TTL_SECONDS ?? 30 * 24 * 60 * 60),
    emailTokenTtlSeconds: Number(process.env.AUTH_EMAIL_TOKEN_TTL_SECONDS ?? 24 * 60 * 60),
    resetTokenTtlSeconds: Number(process.env.AUTH_RESET_TOKEN_TTL_SECONDS ?? 60 * 60),
    totpEnrollmentTtlSeconds: Number(process.env.AUTH_TOTP_ENROLLMENT_TTL_SECONDS ?? 10 * 60),
    exposeDevelopmentTokens: process.env.NODE_ENV !== 'production' && process.env.AUTH_EXPOSE_DEV_TOKENS === 'true',
    secureCookies: process.env.NODE_ENV === 'production',
  };
}
