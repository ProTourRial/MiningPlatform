# VarDiff Policy

**Status:** Policy and deterministic engine contract; runtime Stratum integration remains separate.
**Baseline:** `main` commit `770e38c5e119102635aefa97893cdcbdbc345da9`
**Branch:** `feat/vardiff-policy`

## 1. Objective

VarDiff menjaga interval share tetap berada di sekitar target sambil mencegah difficulty berada di bawah floor upstream, melampaui bound yang disetujui, atau berubah terlalu cepat. Policy ini berlaku per worker/session setelah implementasi runtime menyelaraskan state dan audit event.

## 2. Initial policy defaults

| Parameter                 |   Initial value | Rule                                              |
| ------------------------- | --------------: | ------------------------------------------------- |
| Target share interval     |      15 seconds | Target rata-rata, bukan jaminan                   |
| Retarget interval         |      90 seconds | Tidak ada retarget sebelum interval berlalu       |
| Minimum samples           |               4 | Tidak ada retarget dari sampel yang terlalu kecil |
| Minimum difficulty        |               1 | Lower bound policy                                |
| Maximum difficulty        |   1,000,000,000 | Upper bound policy                                |
| Maximum adjustment factor | 4x per retarget | Factor di-clamp ke `[0.25, 4]`                    |
| Minimum adjustment ratio  |              5% | Perubahan lebih kecil dianggap hysteresis/no-op   |

Nilai di atas adalah baseline implementasi dan tetap memerlukan kalibrasi dari data produksi. Perubahan harus versioned, effective-dated, dan diaudit.

## 3. Retarget calculation

Untuk sampel timestamp `t_1 ... t_n`, observed interval adalah:

```text
observed = max(0.001, (t_n - t_1) / max(1, n - 1))
raw_factor = target_interval / observed
factor = clamp(raw_factor, 1 / max_adjustment_factor, max_adjustment_factor)
next = clamp(previous × factor, max(minimum_difficulty, upstream_floor), maximum_difficulty)
```

Jika perubahan relatif `abs(next - previous) / previous` kurang dari minimum adjustment ratio, hasilnya `NO_CHANGE` dengan alasan `WITHIN_HYSTERESIS`. Keputusan harus mengembalikan previous/next difficulty, observed interval, sample count, factor jika retarget, dan reason code.

## 4. Worker/session rules

Difficulty adalah state per worker/session. Reconnect memulai state dari policy-approved difficulty atau persisted session state; ia tidak boleh mewarisi difficulty worker lain. Job ID dan difficulty yang dikirim ke miner harus memiliki hubungan yang dapat diaudit. Upstream floor selalu dipakai sebagai lower bound dan perubahan floor yang menaikkan current difficulty dicatat sebagai event.

## 5. Abuse and resilience limits

Retarget request tidak boleh dipicu oleh client secara langsung. Sampel diterima hanya dari accepted share evidence yang sudah melewati protocol/runtime validation. Sampel invalid, stale, duplicate, replay, atau malformed tidak masuk ke perhitungan. Queue, connection, and per-worker quotas harus membatasi penggunaan memory dan CPU. Retarget storm, reconnect storm, dan difficulty oscillation harus menghasilkan alert.

## 6. Test vectors

| Case             | Input                         | Expected result                  |
| ---------------- | ----------------------------- | -------------------------------- |
| Too early        | `now - lastRetarget < 90s`    | `NO_CHANGE/WAITING_FOR_INTERVAL` |
| Too few samples  | `<4` samples setelah interval | `NO_CHANGE/WAITING_FOR_SAMPLES`  |
| Fast shares      | 5s observed, current 100      | Retarget to 300                  |
| Slow shares      | 60s observed, current 100     | Retarget to 25                   |
| Adjustment clamp | 0.001s observed, current 100  | Retarget to 400, not unbounded   |
| Upstream floor   | Calculated next below floor 8 | Next difficulty 8                |
| Hysteresis       | Difference below 5%           | `NO_CHANGE/WITHIN_HYSTERESIS`    |
| Invalid time     | Negative/non-finite timestamp | Reject input                     |

## 7. Observability and rollback

Every retarget decision must emit bounded labels for algorithm/region/result and structured fields for worker/session fingerprint, previous/next difficulty, observed interval, sample count, factor, policy ID, and audit/correlation IDs. Raw credentials and high-cardinality raw worker IDs must not be metric labels.

A rollout is aborted if difficulty drops below upstream floor, bounds are bypassed, accepted evidence is lost, retarget becomes unbounded, or worker/session state crosses accounts. Rollback returns to the last compatible policy version and preserves existing job/evidence audit records.

## 8. Acceptance criteria

The policy is ready for runtime integration when the deterministic engine tests pass, every parameter has an owner and effective version, test vectors are reviewed, observability names are aligned, reconnect/failover behavior is specified, and load/soak evidence demonstrates bounded CPU/memory/queue behavior. This branch does not modify `packages/upstream-stratum/**`.
