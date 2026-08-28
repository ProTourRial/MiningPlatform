# P2 Mining Pool Load Test Plan

**Status:** Load-test contract and safe read-only runner; no production traffic.
**Baseline:** `main` commit `770e38c5e119102635aefa97893cdcbdbc345da9`
**Branch:** `feat/pool-load-testing`

## 1. Safety boundary

Load tests run only against a disposable or explicitly approved staging environment. The safe runner allows read-only HTTP requests and refuses unspecified or remote targets unless synthetic-only confirmation is explicit. It does not submit shares, create workers, mutate wallets, reserve payouts, sign, broadcast, or touch production data.

Stratum load profiles are defined for the local/test simulator or an approved isolated staging endpoint. They must use synthetic workers, bounded connection counts, bounded duration, and an explicit abort switch. No load test may target a public pool or production Stratum port.

## 2. Profiles

| Profile  | Purpose                             |             Connections/concurrency |  Duration | Abort                                        |
| -------- | ----------------------------------- | ----------------------------------: | --------: | -------------------------------------------- |
| Smoke    | Verify route and readiness          |                                   1 |       30s | Any safety violation                         |
| Baseline | Establish normal latency/error rate | 5 HTTP workers; 10 Stratum sessions |        5m | Error rate >5% or queue >70%                 |
| Ramp     | Observe gradual capacity curve      |               1 to approved ceiling |       10m | p95 breach, memory slope, rejection anomaly  |
| Soak     | Detect leaks and drift              |                Approved steady rate | 30m to 2h | Memory growth, stale age, queue growth       |
| Burst    | Simulate reconnect/share burst      |      2x baseline for bounded window |       60s | CPU saturation, queue >90%, dropped evidence |
| Failure  | Dependency timeout/unavailable      |                Small synthetic load |        5m | Retry storm, unsafe payout/signing path      |

Exact ceiling, share rate, and duration are deployment decisions. The runner defaults are intentionally low.

## 3. Mining-pool signals

The test report must include connection accept/reject count, subscribe/authorize latency, job notification delay, accepted/stale/invalid/duplicate share counts, share validation latency, reconnect rate, queue depth, memory/CPU, event-loop lag, Stratum error code distribution, template age, and VarDiff decisions. High-cardinality values such as raw worker IDs, user IDs, wallet addresses, transaction IDs, and credentials are excluded from metric labels and reports.

## 4. Pass criteria

A profile passes only when throughput and latency remain within the approved SLO, error/rejection categories match the expected baseline, no accepted evidence is lost or duplicated, queue/memory remain bounded, template/job age stays within policy, VarDiff remains within bounds/floor, and graceful drain preserves in-flight evidence. A load result without environment, source commit, profile, resource data, and cleanup evidence is invalid.

## 5. Failure and cleanup

Abort immediately on production target detection, signer/broadcast invocation, unbounded memory/queue, authentication bypass, cross-account state, missing correlation evidence, duplicate financial side effect, or unsafe retry. Stop generators, drain test connections, revoke synthetic credentials, remove test queues/reservations, and preserve only redacted reports.

## 6. Exit criteria

P2 load readiness requires a passing smoke/baseline profile, an approved ramp ceiling, a soak result with no unexplained memory/queue trend, failure-mode evidence, Stratum simulator evidence, observability correlation, and owner sign-off. Passing this plan does not authorize production mining traffic or payout activation.
