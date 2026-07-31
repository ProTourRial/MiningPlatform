# ADR-0006: Event Delivery and Transactional Outbox

Status: Accepted  
Date: 2026-07-31  
Owner: Abia Nugrahanto

## Decision

Event lintas context menggunakan delivery `at-least-once`. Perubahan database yang wajib menghasilkan event menyimpan outbox record dalam transaksi yang sama. Consumer wajib idempotent dan memvalidasi event version.

## Consequences

- Redis bukan source of truth fakta mining atau accounting.
- Pending messages dipulihkan dan kegagalan permanen masuk dead-letter stream.
- Duplicate delivery adalah perilaku normal dan harus aman.
