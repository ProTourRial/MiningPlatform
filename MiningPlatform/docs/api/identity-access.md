# Identity & Access API

Author: Abia Nugrahanto  
Base path: `/api/v1`

## Public authentication

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` | Create pending account and verification token |
| POST | `/auth/login` | Create session and issue access/refresh tokens |
| POST | `/auth/refresh` | Rotate refresh token and issue access token |
| POST | `/auth/email/verify` | Consume verification token |
| POST | `/auth/email/resend` | Request another verification token |
| POST | `/auth/password/forgot` | Request password-reset token |
| POST | `/auth/password/reset` | Consume reset token and revoke sessions |

## Authenticated security

| Method | Path | Permission |
|---|---|---|
| POST | `/auth/logout` | authenticated session |
| POST | `/auth/password/change` | authenticated session |
| POST | `/auth/2fa/setup` | authenticated session |
| POST | `/auth/2fa/enable` | authenticated session |
| POST | `/auth/2fa/disable` | authenticated session |
| GET | `/auth/sessions` | `sessions.read` |
| DELETE | `/auth/sessions/:id` | `sessions.revoke` |
| DELETE | `/auth/sessions/all` | `sessions.revoke` |

## User, workers, credentials, and audit

| Resource | Base path | Notes |
|---|---|---|
| User profile | `/users` | `/users/me` reads and updates current user |
| Workers | `/workers` | ownership-scoped CRUD and statistics |
| Worker credentials | `/credentials` | one-time create/rotate secret, revoke, expire, list |
| API keys | `/api-keys` | lifecycle only; API-key request authentication is deferred |
| Audit | `/audit` | current-user audit trail |
| System | `/system/dashboard` | production dashboard read model |
| Version | `/version` | release, commit, build date, schema version |

## Cookie behavior

`mp_access` and `mp_refresh` are HttpOnly cookies. Production requires `Secure`. Bearer access tokens are also accepted for API clients. Refresh tokens are rotated and hashed in PostgreSQL.
