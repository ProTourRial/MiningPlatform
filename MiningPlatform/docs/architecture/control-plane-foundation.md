# Control Plane Foundation

Version: 0.3.0-alpha.1  
Date: 2026-08-03

## Boundary

The Control Plane owns website identity, user profile, sessions, RBAC, worker administration, API keys, notification-channel registration, and authenticated dashboard queries. It does not own share validation, upstream pool protocol state, reward settlement, ledger posting, wallet signing, or payout broadcasting.

## Request flow

```text
Browser / API client
  -> Nginx request limit and security headers
  -> NestJS validation pipe
  -> AuthGuard
      -> signed access token + active AuthSession
      OR scoped API key
  -> RBAC / scope check
  -> Control Plane service
  -> PostgreSQL transaction
      -> aggregate mutation
      -> AuditLog
      -> OutboxEvent when asynchronous delivery is required
```

## Identity lifecycle

```text
Register
  -> PENDING_VERIFICATION user
  -> UserSecurity + UserProfile
  -> BTC MiningAccount
  -> EmailVerificationToken(hash for verification + encrypted delivery reference)
  -> identity.email-verification.requested.v1

Verify email
  -> consume all outstanding verification tokens
  -> ACTIVE user

Login
  -> password scrypt verification
  -> optional TOTP or one-time recovery-code verification
  -> AuthSession(refresh hash)
  -> short-lived access token + rotating refresh token

Password reset
  -> one-time reset token (hash for verification + encrypted delivery reference)
  -> password replacement
  -> revoke all active sessions
```

## Worker credential flow

```text
POST /api/v1/workers
  -> Worker(status=OFFLINE)
  -> WorkerCredential(scrypt hash)
  -> return account.worker + plaintext password once

Stratum mining.authorize
  -> ProductionWorkerAuthenticator
  -> account and worker lookup
  -> WorkerCredential verification
  -> credential/IP rate limit and audit
```

## Production dashboard

`GET /api/v1/monitoring/dashboard/overview` produces a user-scoped snapshot from PostgreSQL. Socket.IO authenticates the same active access session and joins only rooms for workers owned by that user. Redis Stream events update those rooms.

## Release gates still closed

- email/Telegram/Discord/webhook delivery workers and channel verification;
- distributed API rate limiting and IP reputation;
- external TLS certificate automation and DDoS service;
- accounting settlement, balance projection, wallet orchestration, and payouts;
- full load, stress, failover, and chaos validation.

## Administrator bootstrap

Public registration always creates `USER`. An operator may promote an already verified, active account through the audited database CLI:

```bash
pnpm user:role set admin@example.com ADMIN --confirm=admin@example.com:ADMIN
```

The administrator must then enable TOTP before `/api/v1/admin/*` is usable. Role changes are not exposed as a public self-service endpoint.
