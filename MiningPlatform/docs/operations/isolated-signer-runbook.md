# Isolated Transaction Signer Runbook

Status: boundary implemented, production funds disabled.

## Trust boundary

- API and web have no signer credential, signer route, private key, wallet unlock material, signed PSBT, or raw transaction.
- Wallet-worker connects to a watch-only Bitcoin Core wallet for balance, PSBT preparation, mempool preflight, broadcast, and chain observation.
- Transaction-signer connects to a separate Bitcoin Core wallet that holds the signing capability. Its RPC credential must not be shared with API, web, wallet-worker, CI, or Vercel.
- Wallet-worker and transaction-signer share only a dedicated signer network. The signer is not published to a host port by the production Compose definition.
- Every signing request is bound to a five-minute canonical manifest, SHA-256 digests, a one-use nonce, timestamp, HMAC, key-reference allowlist, and mutual TLS.

## Required secrets

Provision these through the production secret manager, never Git or Vercel public environment variables:

- `SIGNER_SHARED_SECRET`: independent random value of at least 32 bytes;
- signer-server certificate, private key, and client CA under `SIGNER_TLS_DIRECTORY`;
- wallet-worker client certificate, private key, and signer CA under `WALLET_SIGNER_TLS_DIRECTORY`;
- `BITCOIN_SIGNER_RPC_USER` and `BITCOIN_SIGNER_RPC_PASSWORD` only in transaction-signer;
- `WALLET_ARTIFACT_ENCRYPTION_KEY`: independent 32-byte base64url key only in wallet-worker;
- watch-only Bitcoin RPC credential only in wallet-worker.

The signer key allowlist maps opaque platform references to Bitcoin Core wallet names. It must never contain a seed, descriptor private key, WIF, or wallet passphrase.

## Activation order

1. Keep `PAYOUTS_ENABLED=false`, `PAYOUT_SIGNING_ENABLED=false`, and `PAYOUT_BROADCAST_ENABLED=false`.
2. Verify offline backups and restore of the signer wallet in a separate controlled environment.
3. Verify mutual TLS in both directions and reject an untrusted client certificate.
4. Verify the HMAC replay, expired-manifest, modified-PSBT, fee-cap, foreign-change-output, and unknown-key tests.
5. Start transaction-signer with `SIGNER_ENABLED=true`; `/health/ready` must be ready only after its configuration is valid.
6. Start wallet-worker against a synchronized watch-only node and compare its wallet snapshot to the ledger.
7. Run a no-broadcast regtest or signet exercise through approval, signing, mempool preflight, confirmation, and reconciliation.
8. Enable signing only after the durable wallet lifecycle migration and recovery tests pass.
9. Enable broadcast only for an owner-approved capped pilot. Never enable automatic payout before manual-pilot evidence is accepted.

## Incident response

1. Disable request, signing, and broadcast controls; stop wallet-worker if any transaction state is uncertain.
2. Do not release a reservation for a transaction that may have reached a node or signer.
3. Preserve signing manifest digest, signed artifact digest, expected transaction id, node evidence, and audit records.
4. Revoke signer client certificates and rotate the HMAC secret if caller authentication may be compromised.
5. Move funds to the documented recovery wallet if signer-wallet compromise is suspected.
6. Resume only after wallet/node/ledger reconciliation, root-cause review, and written owner approval.

## Current limitation

The service boundary, protocol, watch-only adapter, encrypted-artifact primitives, tests, and Docker isolation exist. Durable signing-state orchestration and final settlement triggers still require the separately reviewed financial migration. This runbook does not authorize real funds.
