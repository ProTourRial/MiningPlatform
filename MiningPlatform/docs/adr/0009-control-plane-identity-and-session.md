# ADR-0009 — Control Plane Identity, Session, and Miner Credential Boundary

Status: Accepted  
Date: 2026-08-03  
Version: 0.3.0-alpha.1

## Context

The website previously exposed authentication, user, worker, and owner modules as scaffolds. Stratum production authentication existed independently, but no Control Plane workflow created `WorkerCredential` records. Consequently a normal website user could not create a miner identity that the production Stratum server could authenticate.

## Decision

1. Website users authenticate through short-lived HMAC-SHA256 access tokens and rotating opaque refresh tokens.
2. Refresh tokens are stored only as SHA-256 hashes in `AuthSession`; revocation is checked for every protected request.
3. Browser access and refresh tokens use `HttpOnly`, `SameSite=Strict` cookies. API clients may use a Bearer token or scoped API key.
4. Passwords and worker secrets use versioned scrypt hashes. Plaintext secrets are returned only at creation or rotation.
5. TOTP secrets use AES-256-GCM encryption with a deployment-provided 32-byte key. Admin endpoints require an administrator role and enabled TOTP.
6. User account credentials and Stratum worker credentials are distinct security domains.
7. Worker creation and credential rotation are audited and create records consumed directly by `ProductionWorkerAuthenticator`.
8. Email verification and password-reset delivery are expressed as outbox events; provider-specific delivery remains outside the identity transaction.

## Consequences

- Database migration `20260803010000_control_plane_foundation` is mandatory.
- `AUTH_JWT_SECRET`, `AUTH_ENCRYPTION_KEY`, and `AUTH_IP_HASH_KEY` become production requirements.
- Compromising an access token has a bounded lifetime; refresh-token rotation and server-side revocation limit persistence.
- The in-process authentication endpoint limiter is only a single-instance safety layer. Nginx or an external distributed rate limiter remains required for multi-replica deployment.
- Wallet signing, payout approval, and financial step-up authentication are explicitly outside this ADR.
