# Safeheld Test Data

Realistic test data for **10 fictitious regulated firms** across **2 BaaS bank institutions**.
Covers Tier 1 (£180K) to enterprise scale (£780M), single to multi-currency (6 currencies),
all 3 RAG statuses, all major breach types, and high-volume reconciliation (120K accounts).

---

## Bank Institutions

| Bank | Style | Status | Viewer Login |
|---|---|---|---|
| **TestBank UK** | Griffin-style BaaS | PILOT | `viewer@testbank-uk.com` |
| **ClearBridge Bank** | ClearBank-style BaaS | PILOT | `viewer@clearbridge-bank.com` |

---

## Firms — TestBank UK

| # | Firm | Regime | Client Funds | Accounts | Banks | Currencies | RAG |
|---|---|---|---|---|---|---|---|
| 1 | **PayFlow Ltd** | PS25_EMI | £45M | 12 | Barclays, HSBC, Lloyds | GBP/EUR/USD | GREEN |
| 2 | **TransferQuick Ltd** | PS25_PI | £3.2M | 2 | Monzo, Starling | GBP | RED |
| 3 | **EuroRemit Ltd** | PS25_EMI | £12M | 5 | Nationwide, NatWest, Lloyds | GBP/EUR | AMBER |
| 4 | **SwiftPay Solutions Ltd** | PS25_PI | £800K | 1 | Starling | GBP | RED |
| 5 | **GlobalMoney Ltd** | PS25_EMI | £28M | 8 | Barclays, HSBC | GBP/EUR/USD | AMBER |
| 6 | **Apex Payments Group** | PS25_EMI | £520M | 25 | Barclays, HSBC, Lloyds, NatWest, Santander | GBP/EUR/USD/PLN/CHF | GREEN |
| 7 | **NovaPay Ltd** | PS25_PI | £180K | 1 | Monzo | GBP | GREEN |

## Firms — ClearBridge Bank

| # | Firm | Regime | Client Funds | Accounts | Banks | Currencies | RAG |
|---|---|---|---|---|---|---|---|
| 8 | **MegaTransfer International** | PS25_EMI | £780M | 30 | Citi, HSBC, Barclays, Deutsche Bank, Standard Chartered | GBP/EUR/USD/AED/SGD/HKD | RED |
| 9 | **PayRight Europe Ltd** | PS25_EMI | £95M | 15 | Barclays, NatWest, Deutsche Bank, Santander | GBP/EUR | AMBER |
| 10 | **QuickSend Ltd** | PS25_PI | £1.5M | 2 | Monzo, Starling | GBP | GREEN |

---

## Triggered Scenarios

### TestBank UK firms

| # | Type | Firm | Detail |
|---|---|---|---|
| 1 | **SHORTFALL** | TransferQuick | Client £3.2M > Safeguarding £3.2M (seeded via seed_02) |
| 2 | **EXCESS** | EuroRemit | Client GBP £7,000,000 < Ledger GBP £7,060,000 → **+£60,000 (+0.86%)** |
| 3 | **LETTER_EXPIRING** | EuroRemit | SA-ER-NWI-EUR-01 ack letter expires **2026-03-18 (20 days from now)** |
| 4 | **MISSING_DATA** | SwiftPay | Balances last uploaded **2026-02-20** (4 business days stale, threshold = 3) |
| 5 | **DD_OVERDUE** | SwiftPay | Starling Bank DD review due **2025-04-10**, now 10+ months overdue |
| 6 | **SHORTFALL MEDIUM** | GlobalMoney | Client GBP £16,000,000 > Ledger GBP £15,760,000 → **−£240,000 (−1.50%)** |
| 7 | *(none)* | Apex | 25 accounts × 5 currencies, all balanced — enterprise stress test |
| 8 | *(none)* | NovaPay | 40 GBP clients × £180K, all balanced — Tier 1 test |

### ClearBridge Bank firms

| # | Type | Firm | Detail |
|---|---|---|---|
| 9 | **SHORTFALL CRITICAL** | MegaTransfer | Client GBP £400,000,000 > Ledger GBP £378,900,000 → **−£21,100,000 (−5.275%)** |
| 10 | **EXCESS** | PayRight | Client GBP £55,000,000 < Ledger GBP £57,100,000 → **+£2,100,000 (+3.82%)** |
| 11 | **LETTER_MISSING** | PayRight | SA-PR-DBK-EUR-01 (Deutsche Bank AG EUR) — no ack letter on file |
| 12 | *(none)* | QuickSend | 2 accounts × £1,500,000 GBP, all balanced |

---

## Reconciliation Mathematics

### EuroRemit (AMBER — GBP EXCESS)

| Currency | Client Total | Safeguarding Ledger | Variance | Status |
|---|---|---|---|---|
| GBP | £7,000,000 | £7,060,000 | **+£60,000 (+0.86%)** | EXCESS |
| EUR | €4,800,000 | €4,800,000 | €0 | MET |

### GlobalMoney (AMBER — GBP SHORTFALL MEDIUM)

| Currency | Client Total | Safeguarding Ledger | Variance | Status |
|---|---|---|---|---|
| GBP | £16,000,000 | £15,760,000 | **−£240,000 (−1.50%)** | SHORTFALL MEDIUM |
| EUR | €7,000,000 | €7,000,000 | €0 | MET |
| USD | $8,000,000 | $8,000,000 | $0 | MET |

Safeguarding GBP breakdown: Barclays £7,000,000 + £1,800,000 + HSBC £5,500,000 + £1,460,000 = £15,760,000

### Apex (GREEN — all balanced, 25 accounts across 5 banks)

| Currency | Client Total | Safeguarding Ledger | Status |
|---|---|---|---|
| GBP | £280,000,000 | £280,000,000 (5 banks × £56M) | MET |
| EUR | €120,000,000 | €120,000,000 (5 banks × €24M) | MET |
| USD | $80,000,000 | $80,000,000 (5 banks × $16M) | MET |
| PLN | PLN 100,000,000 | PLN 100,000,000 (5 banks × PLN 20M) | MET |
| CHF | CHF 40,000,000 | CHF 40,000,000 (5 banks × CHF 8M) | MET |

### MegaTransfer (RED — GBP SHORTFALL CRITICAL)

| Currency | Client Total | Safeguarding Ledger | Variance | Status |
|---|---|---|---|---|
| GBP | £400,000,000 | £378,900,000 | **−£21,100,000 (−5.275%)** | SHORTFALL CRITICAL |
| EUR | €200,000,000 | €200,000,000 | €0 | MET |
| USD | $100,000,000 | $100,000,000 | $0 | MET |
| AED | AED 50,000,000 | AED 50,000,000 | AED 0 | MET |
| SGD | SGD 30,000,000 | SGD 30,000,000 | SGD 0 | MET |
| HKD | HKD 150,000,000 | HKD 150,000,000 | HKD 0 | MET |

Safeguarding GBP breakdown: Citi £85M + HSBC £78M + Barclays £75M + Deutsche Bank £72M + Standard Chartered £68.9M = £378.9M

### PayRight Europe (AMBER — GBP EXCESS + LETTER_MISSING)

| Currency | Client Total | Safeguarding Ledger | Variance | Status |
|---|---|---|---|---|
| GBP | £55,000,000 | £57,100,000 | **+£2,100,000 (+3.82%)** | EXCESS |
| EUR | €35,000,000 | €35,000,000 | €0 | MET |

---

## Load Order

### Step 1 — Run SQL seeds

```bash
psql $DATABASE_URL -f test-data/seed_01_firms_users.sql    # PayFlow, TransferQuick, TestBank UK
psql $DATABASE_URL -f test-data/seed_03_full_tenants.sql   # 8 new firms + ClearBridge Bank
```

### Step 2 — Upload CSVs per firm via API

`POST /api/v1/firms/{firmId}/uploads` — upload in this order per firm:

| Order | File | Input Type |
|---|---|---|
| 1 | `01_account_register.csv` | `ACCOUNT_REGISTER` |
| 2 | `02_client_balances.csv` | `CLIENT_BALANCES` |
| 3 | `03_client_transactions.csv` | `CLIENT_TRANSACTIONS` |
| 4 | `04_safeguarding_ledger_balances.csv` | `SAFEGUARDING_LEDGER_BALANCES` |
| 5 | `05_bank_balances.csv` | `BANK_BALANCES` |

`ACCOUNT_REGISTER` **must** be uploaded first — all other types reference accounts by `external_account_id`.

| Folder | Firm | Firm ID |
|---|---|---|
| `payflow/` | PayFlow Ltd | `00000001-0001-4001-a001-000000000001` |
| `transferquick/` | TransferQuick Ltd | `00000002-0002-4002-a002-000000000002` |
| `euroremit/` | EuroRemit Ltd | `00000003-0003-4003-a003-000000000003` |
| `swiftpay/` | SwiftPay Solutions Ltd | `00000004-0004-4004-a004-000000000004` |
| `globalmoney/` | GlobalMoney Ltd | `00000005-0005-4005-a005-000000000005` |
| `apex/` | Apex Payments Group | `00000006-0006-4006-a006-000000000006` |
| `novapay/` | NovaPay Ltd | `00000007-0007-4007-a007-000000000007` |
| `megatransfer/` | MegaTransfer International | `00000008-0008-4008-a008-000000000008` |
| `payright/` | PayRight Europe Ltd | `00000009-0009-4009-a009-000000000009` |
| `quicksend/` | QuickSend Ltd | `00000010-0010-4010-a010-000000000010` |

### Step 3 — Run scenario SQL

```bash
psql $DATABASE_URL -f test-data/seed_02_scenarios.sql      # PayFlow + TransferQuick scenarios
psql $DATABASE_URL -f test-data/seed_04_full_scenarios.sql # All 8 new firm scenarios
```

### Step 4 — Trigger reconciliation (optional)

Log in as COMPLIANCE_OFFICER for each firm and manually trigger reconciliation,
or wait for the scheduled job. CSV-based scenarios (shortfalls, excess) are auto-detected
when reconciliation runs. Governance scenarios (letter, DD, stale data) are pre-seeded.

---

## User Accounts

**All test passwords:** `Test@Safeheld2024!`

| Email | Role | Firm |
|---|---|---|
| `compliance@payflow.example.com` | COMPLIANCE_OFFICER | PayFlow Ltd |
| `finance@payflow.example.com` | FINANCE_OPS | PayFlow Ltd |
| `auditor@payflow.example.com` | AUDITOR | PayFlow Ltd |
| `compliance@transferquick.example.com` | COMPLIANCE_OFFICER | TransferQuick Ltd |
| `finance@transferquick.example.com` | FINANCE_OPS | TransferQuick Ltd |
| `viewer@testbank-uk.com` | BANK_VIEWER | TestBank UK |
| `viewer@testbank.example.com` | BANK_VIEWER | TestBank UK (seed_01 legacy) |
| `compliance@euroremit.example.com` | COMPLIANCE_OFFICER | EuroRemit Ltd |
| `finance@euroremit.example.com` | FINANCE_OPS | EuroRemit Ltd |
| `compliance@swiftpay.example.com` | COMPLIANCE_OFFICER | SwiftPay Solutions Ltd |
| `compliance@globalmoney.example.com` | COMPLIANCE_OFFICER | GlobalMoney Ltd |
| `finance@globalmoney.example.com` | FINANCE_OPS | GlobalMoney Ltd |
| `compliance@apexpayments.example.com` | COMPLIANCE_OFFICER | Apex Payments Group |
| `finance@apexpayments.example.com` | FINANCE_OPS | Apex Payments Group |
| `auditor@apexpayments.example.com` | AUDITOR | Apex Payments Group |
| `compliance@novapay.example.com` | COMPLIANCE_OFFICER | NovaPay Ltd |
| `viewer@clearbridge-bank.com` | BANK_VIEWER | ClearBridge Bank |
| `compliance@megatransfer.example.com` | COMPLIANCE_OFFICER | MegaTransfer International |
| `finance@megatransfer.example.com` | FINANCE_OPS | MegaTransfer International |
| `auditor@megatransfer.example.com` | AUDITOR | MegaTransfer International |
| `compliance@payright.example.com` | COMPLIANCE_OFFICER | PayRight Europe Ltd |
| `finance@payright.example.com` | FINANCE_OPS | PayRight Europe Ltd |
| `compliance@quicksend.example.com` | COMPLIANCE_OFFICER | QuickSend Ltd |

---

## What This Tests

| Capability | Tested By |
|---|---|
| Tier 1 pricing (smallest firm) | NovaPay: £180K, 40 clients, 1 account |
| Enterprise scale | Apex: £520M, 25 accounts, 5 currencies |
| Maximum scale + multi-currency | MegaTransfer: £780M, 30 accounts, 120K clients, 6 currencies |
| High-volume reconciliation | MegaTransfer 120,000 client accounts |
| CRITICAL breach | MegaTransfer GBP shortfall £21.1M (5.275%), 2 days open |
| MEDIUM breach | GlobalMoney GBP shortfall £240K (1.50%) |
| MISSING_DATA breach | SwiftPay 4 business days stale |
| DD_OVERDUE breach | SwiftPay Starling Bank 10+ months overdue |
| LETTER_MISSING breach | PayRight Deutsche Bank AG EUR account |
| LETTER_EXPIRING warning | EuroRemit Nationwide EUR (expires 2026-03-18) |
| EXCESS detection | EuroRemit +£60K; PayRight +£2.1M |
| Both BaaS bank dashboards | TestBank UK (7 firms) + ClearBridge Bank (3 firms) |
| All 3 RAG statuses | GREEN ×4, AMBER ×3, RED ×3 |
| Multi-bank safeguarding | Apex 5 banks, MegaTransfer 5 banks |
| Non-GBP currencies | AED, SGD, HKD, PLN, CHF all tested |
