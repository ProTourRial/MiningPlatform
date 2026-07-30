# ADR-0001: Upstream Gateway First

Status: Accepted

## Context

Membangun pool mandiri sejak awal membutuhkan node, block template generation, coinbase construction, vardiff, share validation, block submission, accounting, dan risiko variance.

## Decision

MVP menggunakan upstream pool gateway. Sistem mempertahankan batas domain agar sumber reward dapat diganti dengan pool mandiri kelak.

## Consequences

- Reward wajib direkonsiliasi dengan upstream.
- Metode reward default adalah `FOLLOW_UPSTREAM`.
- Platform tidak boleh mencatat kewajiban yang melampaui reward aktual tanpa reserve policy.
