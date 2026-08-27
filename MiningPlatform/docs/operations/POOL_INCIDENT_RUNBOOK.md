# Pool Incident Runbook

- **Status:** Draft operational runbook; belum menjadi SLA atau authorization untuk payout
- **Scope:** Node, Stratum/upstream dependency, PostgreSQL, Redis, payout control, wallet security, reorg, dan reconciliation
- **Audience:** On-call operations, pool operator, security, treasury/finance, database administrator, dan incident commander
- **Safety rule:** Saat ragu, **pause payout dan protect funds**. Jangan menghapus audit event, mengedit ledger posted, atau menjalankan command destruktif tanpa approval.

## 1. Incident principles

1. **Preserve evidence first.** Catat incident ID, timestamp UTC, current commit/image, affected region/service, operator, alert, dan first observed symptom.
2. **Separate availability from financial truth.** Mining connectivity boleh dipulihkan secara terpisah dari reward posting atau payout. Jangan mengkredit balance untuk mengejar dashboard.
3. **Fail closed for money movement.** Payout reservation, signing, dan broadcast harus dipause jika eligibility, ledger, node, wallet, reconciliation, atau risk state tidak dapat dipercaya.
4. **Use least privilege and two-person control.** Operator yang melakukan mitigasi tidak boleh sendirian mengubah policy atau menyetujui transfer bernilai material.
5. **Communicate status clearly.** Bedakan `degraded`, `paused`, `pending`, `reorg review`, `reconciliation exception`, dan `resolved`.
6. **Recover from durable state.** PostgreSQL ledger/audit and versioned events are authoritative; Redis/cache/dashboard projections are rebuildable.

### Severity model

| Severity | Criteria                                                                                                               | Initial response target | Communication                                                          |
| -------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------: | ---------------------------------------------------------------------- |
| Sev-1    | Suspected fund loss/unauthorized signing, ledger imbalance, double payout, broad pool outage, or security compromise   |               ≤15 menit | Incident commander, security, treasury, owner; status update ≤30 menit |
| Sev-2    | One region/provider down, payout queue blocked, node disagreement, major reconciliation mismatch, or DB/Redis failover |               ≤30 menit | Operations owner and affected stakeholders; update hourly              |
| Sev-3    | Degraded dashboard, isolated worker issue, delayed telemetry, or non-financial API error                               |                  ≤4 jam | Service owner; update when resolved                                    |

## 2. Common incident procedure

### 2.1 Detect and declare

- Open incident record with unique ID and set severity.
- Record alert name, dashboards, logs, request/correlation IDs, deployment/image version, and last known good timestamp.
- Assign incident commander, technical lead, communications owner, and scribe.
- Freeze unrelated deployments, schema changes, policy changes, and payout operations until blast radius is understood.

### 2.2 Contain

- Apply the narrowest safe control: isolate region/provider, pause payout queue, disable signer, drain one replica, or stop a consumer group.
- Preserve raw logs, audit events, node state, queue offsets, and database snapshots according to retention policy.
- Do not restart every service at once; capture state before restart where feasible.
- Do not use manual database edits to “make the numbers match.” Create an explicit correction/reversal workflow.

### 2.3 Recover and close

- Define a recovery hypothesis and a reversible action.
- Verify health, event lag, ledger balance, node agreement, payout state, and user-visible status independently.
- Run targeted smoke tests before reopening traffic or funds.
- Document timeline, root cause, affected users/records, evidence, recovery, residual risk, and follow-up owners.
- Reopen payout only with explicit approval from the responsible security/treasury/operations owners.

## 3. Node down or blockchain node disagreement

### Symptoms

RPC health failure, stale chain tip, block height divergence, fee estimate failure, broadcast failure, mempool disagreement, confirmation delay, or node lag alert.

### Immediate actions

1. Declare Sev-1 if signing/broadcasting may be unsafe; otherwise Sev-2.
2. Mark the affected node `UNHEALTHY` and remove it from payout and confirmation decisions.
3. Compare at least two independent nodes on chain, height, best block hash, headers, mempool/tx status, and clock.
4. Pause payout broadcast if no quorum or if nodes disagree on chain tip/finality.
5. Keep user balance and ledger unchanged; place affected payouts in `NODE_CONFIRMATION_PENDING` or `PAYOUT_PAUSED`.
6. If a healthy standby exists, route read-only confirmation queries according to the failover policy. Do not promote a node merely because its process is running.

### Recovery

- Inspect disk, process, peer count, RPC errors, chain sync, reindex/rebuild state, and network path.
- Restart or reattach the node only after capturing logs and current height/hash.
- Reconcile the recovered node against an independent node before returning it to quorum.
- For a broadcast ambiguity, query transaction status from all available nodes and provider; never blindly resend a raw transaction.

### Exit evidence

Node health checks pass for the agreed window; chain tip is within the approved lag; payout queue has no unclassified state; confirmation and reconciliation reports agree; owner approves resume.

## 4. Redis failure or degradation

### Symptoms

Redis unavailable, replication/cluster failure, event stream lag, duplicate-reservation errors, circuit coordination errors, or cache miss storm.

### Immediate actions

1. Declare Sev-2; escalate to Sev-1 if duplicate payout/credit prevention cannot be guaranteed.
2. Treat Redis as coordination/transport, not financial source of truth.
3. Pause sensitive actions that depend on unavailable locks, reservations, or event delivery.
4. Prevent uncontrolled consumer restarts that may amplify load or duplicate delivery.
5. Check PostgreSQL outbox, idempotency records, consumer offsets, pending payout states, and event backlog.
6. Disable or degrade realtime UI with a truthful `data delayed` state; do not report zero activity as a fact.

### Recovery

- Restore the approved Redis topology or fail over to the tested standby.
- Verify stream/group ownership, pending entries, TTL policy, and duplicate reservation keys.
- Replay events only through idempotent consumers and a bounded batch.
- Compare projected dashboard data with PostgreSQL durable facts.
- Re-enable payout reservation only after concurrency/idempotency guard tests pass.

### Exit evidence

Redis health and replication are stable; backlog drains within target; no pending entries are lost or double-processed; idempotency checks pass; financial read models match durable records.

## 5. PostgreSQL failure or degradation

### Symptoms

Connection failures, high latency, transaction serialization conflicts, replication lag, disk exhaustion, deadlocks, read/write divergence, migration lock, or failed backup.

### Immediate actions

1. Declare Sev-1 if ledger, payout, or identity writes are at risk; otherwise Sev-2.
2. Stop payout creation, reservation, signing, and broadcast if authoritative state cannot be read/written safely.
3. Stop nonessential writes and high-volume retries; preserve current error rates and connection metrics.
4. Protect the primary from connection storms by draining workers or applying backpressure.
5. Confirm the latest successful WAL/backup and replication position; do not promote a stale standby without documenting potential data loss.
6. Keep user-facing balances read-only or explicitly unavailable; do not serve stale financial data without timestamp and warning.

### Recovery

- Diagnose capacity, locks, connection pool, disk, replication, and application retry behavior.
- Fail over only through the approved PostgreSQL procedure with RPO assessment.
- Run consistency checks for ledger balance, idempotency, outbox, payout states, and audit continuity.
- If restore is needed, restore to a disposable target first, validate counts/checksums, then obtain owner approval for the target.
- Rebuild projections from durable events only after source integrity is established.

### Exit evidence

Primary/standby health is stable; replication lag is within target; ledger trial balance is balanced; outbox/idempotency and payout state are reconciled; backup/restore evidence is recorded; operations and finance approve resume.

## 6. Payout pause or payout queue incident

### Trigger conditions

Pause payout on ledger imbalance, reconciliation mismatch, node disagreement, wallet compromise, signer uncertainty, route misconfiguration, duplicate request suspicion, provider outage, sanctions/risk hold, or unexplained queue growth.

### Immediate actions

1. Set global payout gate to paused using the approved control path; do not edit database flags manually.
2. Stop new eligibility reservations, approvals, signing, and broadcasts. Preserve already-broadcast transactions for blockchain tracking.
3. Snapshot payout queue, reservations, approvals, signer audit, node state, and relevant ledger records.
4. Classify each item as `NOT_STARTED`, `RESERVED`, `APPROVAL_PENDING`, `SIGNED`, `BROADCAST`, `CONFIRMED`, `FAILED`, or `EXCEPTION`.
5. Notify treasury, security, operations, and owner. Publish a user-facing status message without exposing private details.
6. Do not cancel or recreate a payout unless the state machine and reconciliation evidence authorize it.

### Recovery

- Identify the trigger and prove that source balances, reservations, and destination policy are correct.
- For `SIGNED` or `BROADCAST`, determine transaction status before any retry.
- For unbroadcast reservations, release or revalidate only through an idempotent, audited workflow.
- Run a small controlled test on a non-material/test route if applicable.
- Obtain two-person approval to resume, with explicit scope, time, limit, and monitoring window.

### Exit evidence

No unexplained reservation or duplicate intent remains; payout records reconcile to ledger and node state; incident risk is accepted; resume approval is recorded; post-resume monitoring is active.

## 7. Wallet compromise or suspected key exposure

### Immediate actions — Sev-1

1. Assume compromise until disproven. Disable signer access, payout executor, wallet hot path, and affected credentials immediately.
2. Pause all payout and conversion operations; do not broadcast a “rescue” transaction without an approved incident commander and security plan.
3. Revoke exposed API keys, operator sessions, wallet credentials, RPC credentials, CI secrets, and cloud tokens as applicable.
4. Preserve forensic evidence: signer logs, HSM/KMS audit, host snapshots, access logs, transaction history, and configuration versions.
5. Notify security lead, treasury, owner, legal/compliance, infrastructure provider, and affected counterparties.
6. Determine whether private keys, seed phrases, raw transactions, destination data, or signing intents were exposed. Never put secrets into the incident channel.

### Containment and recovery

- Move to a newly generated wallet/key boundary using an approved ceremony; never reuse a suspected key.
- Review allowlists, approval holders, withdrawal limits, hot/warm/cold allocation, and emergency stop controls.
- Compare internal ledger, wallet balance, blockchain transactions, and payout intents.
- Treat any unknown transaction as potentially irreversible; record tx hash and use chain/provider escalation.
- Require independent security review and owner authorization before restoring signer connectivity.

### Exit evidence

Key boundary is replaced or proven safe; all credentials are rotated; unknown transactions are classified; balances and payouts are reconciled; legal/compliance notifications are assessed; recovery and hardening actions have owners and deadlines.

## 8. Reorg, orphan, or finality incident

### Symptoms

Chain tip changes, previously observed block disappears, block reward reverses, confirmation count decreases, conflicting transaction state, or provider/node disagreement.

### Immediate actions

1. Mark affected block, reward period, contribution, and payout records as under review.
2. Stop spendability of immature/affected reward; if necessary, pause payout for impacted asset/route only.
3. Record old/new chain tip, block hashes, heights, affected tx IDs, node observations, and detection time.
4. Do not delete reward or alter posted journal lines.
5. Create explicit reorg/orphan event and route it to reconciliation.

### Recovery

- Wait for the approved finality/maturity policy or obtain an explicit security decision for exceptional handling.
- Recompute affected reward period from immutable share and settlement facts.
- Post equal-and-opposite reversal or adjustment entries where required; preserve original references.
- Re-evaluate payout reservations whose source balance changed.
- Update user-visible status with pending/reorg explanation and timestamp.

### Exit evidence

Final chain state is stable; all affected records have a deterministic outcome; ledger and wallet reconcile; payout eligibility is recalculated; exception is closed by an authorized operator.

## 9. Reconciliation mismatch

### Trigger examples

Internal settlement differs from upstream report; user liability differs from ledger; ledger differs from payout reservations; wallet/node balance differs from expected; or referral/donation liability does not equal policy allocation.

### Immediate actions

1. Declare Sev-1 for unexplained financial imbalance; otherwise Sev-2.
2. Freeze affected asset, route, period, or payout scope. Prefer the narrowest safe scope.
3. Capture source report, checksum, source period, internal journal IDs, event IDs, payout IDs, wallet/node data, and policy version.
4. Stop manual adjustments that bypass the correction workflow.
5. Assign an independent reviewer; the person importing evidence should not be the sole approver of correction.

### Investigation sequence

- Verify source identity, period boundaries, asset/network, units, decimal precision, and timezone.
- Compare gross reward, upstream fee, network fee, platform fee, referral share, clearing, user allocation, and payout reservation.
- Check duplicate delivery, missing outbox event, late settlement, orphan/reorg, conversion quote, and rounding.
- Rebuild read models from immutable events where possible.
- Classify as `DATA_DELAY`, `PROVIDER_VARIANCE`, `DUPLICATE`, `MISSING_EVENT`, `POLICY_ERROR`, `CHAIN_REORG`, `UNAUTHORIZED`, or `UNKNOWN`.

### Correction

- Request a versioned correction document with source checksum, reason, evidence, and expected balanced result.
- Require two-owner approval for correction/replacement; the second owner must be different from the requester.
- Post a new adjustment/reversal journal entry; do not edit or delete posted facts.
- Re-run balance, liability, payout eligibility, and audit-trace checks.
- Communicate material user impact and tax/reporting impact according to legal policy.

### Exit evidence

Source and internal records are matched or an approved exception remains with owner and deadline; trial balance is balanced; affected payout scope is re-evaluated; correction is auditable; postmortem/action items are recorded.

## 10. Communication templates

### Internal declaration

```text
Incident: <ID>
Severity: <Sev-1|Sev-2|Sev-3>
Started: <UTC>
Detected by: <alert/operator>
Affected scope: <service/asset/region/period>
Current controls: <payout paused / provider isolated / read-only>
Known facts: <facts only>
Unknowns: <open questions>
Next update: <UTC>
Incident commander: <name>
Technical lead: <name>
```

### User-facing status

> Kami sedang mengalami gangguan pada `<surface/asset/region>`. Untuk melindungi saldo dan integritas transaksi, `<payout/feature>` sementara dipause. Saldo dan histori tidak diubah secara manual. Mining/monitoring `<tersedia atau terdampak>` dengan data mungkin mengalami keterlambatan. Pembaruan berikutnya: `<timestamp UTC>`.

## 11. Required evidence and postmortem

Setiap incident finansial atau availability material harus menyimpan:

- timeline UTC dan incident owner;
- alert, dashboard snapshot, logs, traces, request/correlation IDs;
- deployment/config/policy versions;
- database/Redis/node state dan backup/restore record bila relevan;
- affected users/assets/routes/payouts tanpa mengekspos data sensitif;
- containment, recovery, approval, dan resume evidence;
- root cause, contributing factors, detection gap, dan customer impact;
- corrective/preventive actions dengan owner, priority, due date, dan verification test.

Runbook ini harus diuji melalui game day untuk setiap skenario sebelum payout nyata diaktifkan, dan ditinjau ulang setelah incident, perubahan topology, perubahan policy, atau perubahan provider.
