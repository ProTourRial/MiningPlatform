# Context Map

Owner: Abia Nugrahanto  
Status: Accepted baseline

```mermaid
flowchart LR
  IAM[Identity & Access] --> WM[Worker Management]
  WM -->|worker + credential| MS[Mining Sessions]
  MS --> SP[Share Processing]
  UP[Upstream Pool Management] <--> MS
  SP --> EP[Event Plane]
  EP --> MON[Monitoring]
  EP --> RA[Reward Accounting]
  RA --> LED[Ledger]
  LED --> PAY[Wallet & Payout]
  EP --> AUD[Audit & Security]
  MON --> CP[Control Plane Read Models]
  MON --> TR[Transparency]
  OPS[Owner Operations] --> WM
  OPS --> UP
  OPS --> PAY
```

## Relationship rules

- Worker Management adalah upstream context untuk identitas worker.
- Mining Sessions hanya menerima snapshot identitas dan credential result, bukan password plaintext.
- Share Processing adalah upstream context untuk monitoring dan accounting.
- Reward Accounting adalah upstream context untuk Ledger.
- Ledger adalah upstream context untuk payout eligibility.
- Event Plane memakai published language berupa versioned domain events.
- Synchronous dependency dibatasi pada operasi yang membutuhkan jawaban segera, seperti worker authentication dan upstream share response.
