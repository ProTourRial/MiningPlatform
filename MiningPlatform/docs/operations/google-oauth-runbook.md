# Google OAuth Operations Runbook

**Status:** Optional, fail-closed federated sign-in boundary
**Release:** `0.3.0-alpha.8` candidate
**Schema:** 23 (`20260908010000_google_oauth_identity_foundation`)

## Security model

MiningPlatform uses Google's confidential web-server authorization-code flow with PKCE S256,
state, nonce, an initiating-browser proof, exact redirect URI, and server-side ID-token verification.
The application stores only the provider subject, verified email snapshot, one-time state/nonce/browser
binding hashes, and an encrypted PKCE verifier. The raw browser binding exists only in a short-lived
HttpOnly `SameSite=Lax` cookie, uses the `__Host-` prefix on HTTPS, and is cleared on every terminal
callback path. Google access tokens, refresh tokens, authorization codes, and ID tokens are not
persisted.

Google Sign-In does not create an account and never auto-links by matching email. A user must first
register and verify a local MiningPlatform account, enable TOTP, obtain a single-use password+TOTP
step-up authorization, and explicitly link the Google identity from **Dashboard → Security**. The
Google email must exactly match the verified MiningPlatform email. Each user may link one Google
identity and each Google provider subject may belong to one user.

## Google Cloud configuration

1. Configure the OAuth consent screen and create an **OAuth client ID → Web application**.
2. Register exactly one stable authorized redirect URI for the environment:

   ```text
   https://<APP_URL-host>/api/v1/auth/google/callback
   ```

3. Set secrets in the deployment secret manager, never in Git, issue comments, logs, screenshots, or
   chat:

   ```text
   APP_URL=https://pool.example.com
   GOOGLE_OAUTH_ENABLED=true
   GOOGLE_OAUTH_CLIENT_ID=<web-client-id>.apps.googleusercontent.com
   GOOGLE_OAUTH_CLIENT_SECRET=<secret-manager-reference>
   GOOGLE_OAUTH_ATTEMPT_TTL_SECONDS=300
   ```

`APP_URL` must be an exact origin without a path. Production requires HTTPS. HTTP is accepted only
for localhost/loopback development. Preview deployments need a stable domain registered separately;
Vercel's per-deployment random domains must not be treated as wildcard redirect URIs.

Google's authoritative references are the
[web-server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server),
[OpenID Connect guide](https://developers.google.com/identity/openid-connect/openid-connect), and
[OAuth policy](https://developers.google.com/identity/protocols/oauth2/policies).

## Activation and rollback

With `GOOGLE_OAUTH_ENABLED` absent or not exactly `true`, `/auth/status` reports Google disabled and
the web application hides the button. Partial credentials do not activate the feature. When enabled,
invalid client IDs, secrets, origins, or TTLs fail application startup/configuration access instead of
falling back to a weaker flow.

To roll back provider access, set `GOOGLE_OAUTH_ENABLED=false` and redeploy. Existing local passwords,
TOTP, refresh-token families, and linked-identity audit history remain intact. Disabling the provider
does not delete identity rows. If a provider credential may be compromised, disable the feature,
rotate the Google secret in Google Cloud, revoke affected MiningPlatform sessions, inspect
`EXTERNAL_IDENTITY_LINKED`, `EXTERNAL_IDENTITY_UNLINKED`, and `USER_LOGIN_SUCCEEDED` audit events,
then re-enable only after validation.

## Acceptance checks

- Disabled configuration renders no Google login button.
- Link and unlink both reject missing, expired, replayed, wrong-session, or wrong-scope step-up tokens.
- Callback rejects missing/expired/replayed state, missing or mismatched browser binding, provider
  cancellation, invalid PKCE exchange, unverified email, wrong nonce,
  invalid issuer/audience/signature/expiry, and email mismatch.
- A callback copied into another browser fails before state consumption or provider exchange and never
  receives MiningPlatform session cookies; the legitimate initiating browser may still complete once.
- An unlinked Google subject cannot authenticate even when its verified email matches an existing user.
- A linked subject receives the same MiningPlatform access cookie and rotating refresh-token family as
  local login; Google tokens never become application session tokens.
- The callback returns only allowlisted local paths under the exact `APP_URL` origin.
- Fresh and alpha.7 upgrade migrations, API integration, browser build, and deployment smoke checks are
  green on the exact candidate commit before enabling a live provider.
