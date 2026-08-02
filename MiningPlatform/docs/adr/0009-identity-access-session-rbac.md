# ADR-0009: Identity, Session, and Permission-Based RBAC

Author: Abia Nugrahanto  
Status: Accepted  
Date: 2026-07-31

## Context

MiningPlatform needs user identity before production worker management, accounting, notifications, and owner operations can be exposed through the website. Web identity must remain separate from Stratum worker credentials.

## Decision

1. Web users authenticate with email, password, optional TOTP, and refresh-token-backed sessions.
2. Access tokens are short-lived HS256 JWTs containing user and session identifiers. Database session state remains authoritative.
3. Refresh tokens are random, stored only as hashes, rotated on every refresh, and revoked on detected reuse.
4. Sessions store device/browser metadata, HMAC-derived IP identity, location hints, last activity, expiry, and revocation state.
5. Email verification and password reset tokens are single-use, hashed, and expiring.
6. TOTP secrets are encrypted at rest. Backup codes are one-time hashes.
7. Authorization uses Role → Permission mappings. Ownership checks remain in domain services and are not replaced by RBAC.
8. Website sessions never authenticate Stratum miners. Miners use independently rotatable `WorkerCredential` records.
9. Authentication endpoints are rate-limited. Production requires Redis-backed rate-limit state.
10. Identity and security actions produce immutable audit entries.

## Consequences

- Revoking a session invalidates otherwise valid JWTs.
- Permission changes take effect on the next guarded request because permissions are read from PostgreSQL.
- Session and token cleanup becomes a scheduler responsibility.
- Production email delivery needs a separate provider adapter before public launch.
- API key authentication is not enabled in this release; only API key lifecycle management is provided.
