# Identity & Access Architecture — v0.3.0

Author: Abia Nugrahanto  
Status: Implemented foundation

## Domain boundaries

```text
Identity and Access
├── User registration and verification
├── Password lifecycle
├── TOTP and backup codes
├── Web sessions and refresh rotation
├── Role and permission resolution
└── API key lifecycle

Worker Management
├── Worker CRUD
├── Worker ownership
├── Worker status and statistics
└── Worker credential lifecycle

Mining Plane
└── Uses WorkerCredential only; never web passwords or web sessions
```

## Authentication flow

```text
Browser
  ↓ email + password + optional TOTP
POST /api/v1/auth/login
  ↓ verify account and security state
UserSession created
  ↓
HttpOnly access + refresh cookies
  ↓
AccessTokenGuard validates JWT and authoritative session
  ↓
PermissionsGuard resolves current permissions
  ↓
Domain service enforces ownership
```

## Session lifecycle

```text
ACTIVE
├── refresh → token hash rotated
├── user logout → REVOKED
├── password change/reset → REVOKED
├── user revokes device → REVOKED
├── refresh token reuse → REVOKED
└── expiry cleanup → EXPIRED
```

## Security rules

- Passwords and worker secrets use separate versioned scrypt formats.
- Refresh, verification, reset, backup, and API-key secrets are never stored in plaintext.
- TOTP secrets use AES-256-GCM with an environment-provided encryption key.
- Raw IP addresses are not persisted; normalized IP values are HMAC-derived.
- Production authentication rate limiting fails closed when Redis is unavailable.
- User role permissions do not bypass worker ownership checks.
- `OWNER` receives wildcard permission, but sensitive financial functions remain disabled.

## Delivery adapters

The release includes a development console adapter for verification/reset tokens. Production startup rejects development delivery mode. SMTP or transactional-email provider integration remains a release blocker.
