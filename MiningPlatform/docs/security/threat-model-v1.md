# Threat Model v1

## Aset yang dilindungi

- Saldo dan jurnal pengguna
- Hot wallet funds
- Cold wallet procedure
- Credential upstream pool
- Worker credential
- Owner session
- Payout address
- Audit log
- Miner network metadata

## Ancaman utama

1. Account takeover
2. Payout address replacement
3. Duplicate payout
4. Ledger manipulation
5. Share spoofing atau replay
6. Upstream reconciliation mismatch
7. Stratum DDoS
8. Credential leakage
9. Compromised monitoring agent
10. Owner privilege abuse

## Kontrol minimum

- Password hashing yang kuat
- 2FA wajib untuk Owner
- Step-up authentication untuk perubahan alamat payout
- Cooling period setelah perubahan alamat
- Idempotency key pada journal dan payout
- Append-only audit events
- Rate limit dan connection limit Stratum
- Secret manager pada produksi
- Wallet service terisolasi
- Payout kill switch
- Backup dan restore drill
- Reconciliation sebelum payout
