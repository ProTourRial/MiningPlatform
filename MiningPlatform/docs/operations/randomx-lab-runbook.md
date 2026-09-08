# RandomX Gateway Laboratory Runbook

## Scope and safety boundary

This runbook starts only the synthetic, loopback-only RandomX laboratory. It does not approve public
traffic, production credentials, user balance credits, reward allocation, or payout. The gateway is
disabled by default and rejects `NODE_ENV=production` even when enablement variables are present.

The laboratory must use:

- a disposable or explicitly approved PostgreSQL database;
- an isolated Redis namespace;
- a loopback miner listener;
- synthetic worker and upstream credentials;
- a loopback RandomX sidecar, or an HTTPS endpoint approved for laboratory use;
- an `UpstreamPool` row whose asset exactly matches the authenticated mining account's enabled `rx/0`
  asset.

Never place credentials in this document, shell history, logs, screenshots, or committed environment
files.

## Required configuration

Copy the RandomX section from `.env.example` into an untracked laboratory environment and set:

```text
NODE_ENV=development
RANDOMX_GATEWAY_ENABLED=true
RANDOMX_GATEWAY_MODE=lab
RANDOMX_GATEWAY_LAB_ACK=I_ACCEPT_RANDOMX_LAB_ONLY
RANDOMX_MINER_HOST=127.0.0.1
```

Also provide `DATABASE_URL`, `REDIS_URL`, a random `RANDOMX_IP_HASH_KEY` of at least 32 bytes, the exact
laboratory `RANDOMX_UPSTREAM_POOL_ID`, upstream endpoint credentials, and the sidecar URL. Keep the job
TTL at or below five minutes. A different miner host is rejected by the configuration loader.

## Start and verify

1. Apply every migration to the disposable database with `pnpm db:migrate:deploy`.
2. Build the dependency graph with `pnpm --filter @mining/randomx-gateway... build`.
3. Start the gateway with `pnpm start:randomx-gateway:lab`.
4. Confirm the structured startup record says `mode=lab` and the listener address is loopback.
5. Connect one synthetic XMRig-compatible client using its one-time worker credential.
6. Confirm the miner receives a private job identifier, not the upstream job identifier.
7. Submit a synthetic proof and verify all of the following correlate exactly:
   - sidecar seed and nonce-applied blob;
   - upstream session, job, nonce, and result;
   - `RandomXShareSubmissionIntent`;
   - `RandomXUpstreamShareDecision`;
   - `mining.randomx.share.accepted.v1` outbox event.
8. Confirm no reward allocation, journal, balance, reservation, or payout is created until a separately
   imported and reconciled upstream settlement exists.

The automated equivalent is `apps/randomx-gateway/src/runtime.integration.test.ts`. It uses real TCP,
HTTP, PostgreSQL, and Redis boundaries with a synthetic upstream and synthetic validator sidecar.

## Failure behavior

- A second miner receiving an identical nonce-normalized blob is disconnected rather than issued
  overlapping work.
- A lost Redis lease makes job resolution fail closed.
- Sidecar failure cannot create accepted evidence.
- An upstream failure after durable intent is reported as uncertain and must not be retried
  automatically.
- Disconnect clears private job mappings; reconnect creates a new upstream session.

## Shutdown and evidence

Stop the process with `SIGINT` or `SIGTERM`. Verify the miner listener, upstream sockets, worker-auth
Redis client, and work-lease Redis client close, then remove only the explicitly named disposable
containers and volumes. Record redacted test output and commit identity; never retain raw credentials or
authorization messages.

Public activation remains blocked until sidecar provenance and known-answer vectors, empirical
provider-specific distinct-work behavior, restart/failover/partition/load evidence, clock-domain
monitoring, unresolved-intent operator recovery, and exact settlement-to-liability reconciliation are
all approved and green.
