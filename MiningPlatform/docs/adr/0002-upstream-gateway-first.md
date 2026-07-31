# ADR-0002: Upstream Gateway First

Status: Accepted  
Date: 2026-07-30  
Owner: Abia Nugrahanto

## Context

Pool Bitcoin independen membutuhkan block-template generation, coinbase construction, node operations, propagation, VarDiff, accounting, dan reserve untuk variance. Membangun seluruhnya sebelum pipeline share stabil meningkatkan risiko.

## Decision

Fase produksi pertama menggunakan upstream pool gateway. MiningPlatform menerima worker, memvalidasi share secara lokal, meneruskan share ke upstream, dan menyimpan keputusan upstream secara terpisah.

## Consequences

- Reward default `FOLLOW_UPSTREAM`.
- Reward wajib direkonsiliasi dengan penerimaan upstream.
- Platform tidak mengklaim block, pool luck, atau reward yang tidak benar-benar menjadi hak platform.
- Pool adapter dapat diganti tanpa mengubah ledger dan frontend.
