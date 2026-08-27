# Stratum Production Readiness

**Status:** Contract and test plan; `packages/upstream-stratum/**` remains frozen.
**Baseline:** `main` commit `770e38c5e119102635aefa97893cdcbdbc345da9`
**Branch:** `feat/stratum-production-readiness`

## 1. Scope and safety

Dokumen ini mendefinisikan kriteria produksi untuk koneksi miner dan share volume tinggi. Ia tidak mengubah protocol implementation, upstream client, gateway, RandomX, migration, accounting, atau production firewall. Semua load test harus memakai disposable environment dan tidak boleh mengirim payout atau transaksi nyata.

## 2. Protocol contract

| Area             | Requirement                                                                    | Evidence                     |
| ---------------- | ------------------------------------------------------------------------------ | ---------------------------- |
| Framing          | JSON-RPC line framing, bounded line length, malformed input rejected           | Protocol negative tests      |
| Handshake        | `mining.subscribe` and `mining.authorize` have timeout and safe error response | Synthetic client trace       |
| Authorization    | Worker identity is scoped to account/session; invalid credential is rejected   | Auth test and audit event    |
| Job notification | Job ID, clean-jobs flag, target/difficulty, and template age are observable    | Job fixture and metric query |
| Share submission | Duplicate/stale/invalid share has deterministic code and no reward side effect | Share rejection vectors      |
| Connection       | Idle timeout, maximum connections, per-account quotas, and graceful drain      | Soak/load evidence           |
| Security         | No secret/address/credential appears in response or logs                       | Redaction review             |

## 3. Limits and backpressure

All limits must be explicit, versioned, and observable. The initial policy uses bounded connection count per instance, bounded input line size, bounded in-flight share submissions, queue capacity, queue timeout, per-account and per-IP rate limits, and a maximum worker count per account. Exact values are deployment decisions and must be recorded per environment before production.

When queue capacity or downstream validation capacity is exhausted, the system must fail predictably with a retry-safe response or close the connection according to protocol policy. It must not grow memory without bound, drop accepted evidence silently, or retry a share indefinitely.

## 4. Ban and abuse policy

Ban decisions require a reason code, scope, duration, actor/system, evidence IDs, and expiry. Invalid protocol framing, credential stuffing, share replay, abusive reconnects, and intentional flood are distinct reasons. A temporary ban is preferred to a permanent ban when confidence is low. Operators need an appeal/unban path with audit trail, and false positives must be measurable.

## 5. SLO and load profile

| Signal                           |           Initial target |      Warning |                    Critical |
| -------------------------------- | -----------------------: | -----------: | --------------------------: |
| Connection accept success        |                  >=99.9% |   <99.9%/10m |                    <99%/10m |
| Share validation success latency |                 p95 <=1s |  p95 >1s/10m |                 p95 >3s/10m |
| Share rejection rate             | Within approved baseline | >2x baseline |        >5% and >2x baseline |
| Stale share rate                 | Within approved baseline | >2x baseline |     Sustained abnormal rate |
| Queue depth                      |            <70% capacity |    >=70%/10m |      >=90% or timeout spike |
| Job/template age                 |                    <=60s |         >60s |                       >120s |
| Reconnect rate                   | Within approved baseline | >2x baseline | Sustained region-wide spike |

Load profiles must include normal ramp, burst, sustained soak, reconnect storm, slow client, malformed client, downstream validator latency, Redis unavailable, node/provider unavailable, and graceful deploy drain. Each profile records worker count, shares per second, connection count, duration, region, CPU/memory/network, error classes, queue depth, and abort criteria.

## 6. Failure and rollback

A release is aborted when memory growth is unbounded, share evidence is lost or duplicated, queue backpressure is bypassed, authentication scope is incorrect, a critical metric is absent, or an environment marked payout-disabled invokes signer/broadcast. Rollback drains new connections, preserves in-flight evidence, returns traffic to the last compatible version, and records contract/source commit, active jobs, and known stale window.

## 7. Acceptance criteria

1. Protocol, authorization, stale/duplicate share, timeout, and malformed input tests are deterministic.
2. Connection, queue, input, account, and IP limits are explicit per environment.
3. Backpressure prevents unbounded memory and silent loss of accepted evidence.
4. Ban decisions are reasoned, bounded, auditable, and reversible by authorized operator.
5. Load/soak profiles have target, baseline, owner, abort criteria, and report template.
6. SLO metrics and alerts use the approved observability catalog without high-cardinality labels.
7. Rollback and graceful drain are exercised with synthetic traffic before production.

## 8. Frozen boundary

Implementation changes to `packages/upstream-stratum/**`, RandomX gateway, or production networking remain outside this branch and require the Codex checkpoint and separate review.
