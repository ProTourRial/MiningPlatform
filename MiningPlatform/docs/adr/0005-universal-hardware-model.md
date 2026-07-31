# ADR-0005: Universal Hardware Model

Status: Accepted  
Date: 2026-07-31  
Owner: Abia Nugrahanto

## Context

Jenis hardware dan algoritma adalah dua konsep berbeda. CPU, GPU, FPGA, ASIC, atau rig hybrid dapat memakai software serta algoritma yang berbeda. User-agent Stratum juga sering ambigu.

## Decision

Worker memiliki profile hardware evidence-based dengan type, possible types, detection source, dan confidence. Hardware tidak ditentukan hanya dari nama software. Monitoring agent dan miner API memiliki confidence lebih tinggi daripada user-agent.

## Consequences

- Platform universal terhadap hardware.
- Validator aktif tetap BTC/SHA-256 sampai adapter algoritma lain dibuat.
- Data yang tidak pasti disimpan sebagai `UNKNOWN` atau daftar kemungkinan, bukan fakta palsu.
