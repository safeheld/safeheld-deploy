-- =============================================================================
-- SEED 03: Full 10-Firm Tenant Set — TestBank UK (firms 3-7) + ClearBridge Bank (firms 8-10)
-- Adds: 8 new firms, ClearBridge Bank institution, BANK_VIEWER users for both banks,
--       all firm users, and bank_institution_firms links.
-- Run AFTER seed_01_firms_users.sql.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- FIRMS — TestBank UK cohort (3 of 7, linked below)
-- =============================================================================

INSERT INTO firms (
  id, name, fca_frn, regime, status, base_currency,
  safeguarding_method, material_discrepancy_pct, material_discrepancy_abs,
  dpa_signed, dpa_signed_date, created_at, updated_at
) VALUES
-- 3. EuroRemit Ltd — EMI, £12M, GBP/EUR, AMBER (minor GBP excess, EUR letter expiring 20 days)
(
  '00000003-0003-4003-a003-000000000003',
  'EuroRemit Ltd',
  'FRN-900003',
  'PS25_EMI',
  'ACTIVE',
  'GBP',
  'SEGREGATION',
  1.50,
  50000.00,
  true,
  '2022-09-01',
  NOW(),
  NOW()
),
-- 4. SwiftPay Solutions Ltd — PI, £800K, GBP only, RED (stale recon 4 days, DD overdue)
(
  '00000004-0004-4004-a004-000000000004',
  'SwiftPay Solutions Ltd',
  'FRN-900004',
  'PS25_PI',
  'ACTIVE',
  'GBP',
  'SEGREGATION',
  2.00,
  25000.00,
  true,
  '2023-04-01',
  NOW(),
  NOW()
),
-- 5. GlobalMoney Ltd — EMI, £28M, GBP/EUR/USD, AMBER (MEDIUM severity GBP shortfall)
(
  '00000005-0005-4005-a005-000000000005',
  'GlobalMoney Ltd',
  'FRN-900005',
  'PS25_EMI',
  'ACTIVE',
  'GBP',
  'SEGREGATION',
  1.50,
  100000.00,
  true,
  '2021-11-01',
  NOW(),
  NOW()
),
-- 6. Apex Payments Group — EMI, £520M, GBP/EUR/USD/PLN/CHF, GREEN (enterprise scale)
(
  '00000006-0006-4006-a006-000000000006',
  'Apex Payments Group',
  'FRN-900006',
  'PS25_EMI',
  'ACTIVE',
  'GBP',
  'SEGREGATION',
  1.00,
  500000.00,
  true,
  '2019-06-01',
  NOW(),
  NOW()
),
-- 7. NovaPay Ltd — PI, £180K, GBP only, GREEN (smallest firm, Tier 1)
(
  '00000007-0007-4007-a007-000000000007',
  'NovaPay Ltd',
  'FRN-900007',
  'PS25_PI',
  'ACTIVE',
  'GBP',
  'SEGREGATION',
  2.00,
  5000.00,
  true,
  '2024-03-01',
  NOW(),
  NOW()
);

-- =============================================================================
-- FIRMS — ClearBridge Bank cohort
-- =============================================================================

INSERT INTO firms (
  id, name, fca_frn, regime, status, base_currency,
  safeguarding_method, material_discrepancy_pct, material_discrepancy_abs,
  dpa_signed, dpa_signed_date, created_at, updated_at
) VALUES
-- 8. MegaTransfer International — EMI, £780M, 6 currencies, RED (CRITICAL breach 2 days ago)
(
  '00000008-0008-4008-a008-000000000008',
  'MegaTransfer International',
  'FRN-900008',
  'PS25_EMI',
  'ACTIVE',
  'GBP',
  'SEGREGATION',
  1.00,
  500000.00,
  true,
  '2018-03-01',
  NOW(),
  NOW()
),
-- 9. PayRight Europe Ltd — EMI, £95M, GBP/EUR, AMBER (GBP excess £2.1M, one letter missing)
(
  '00000009-0009-4009-a009-000000000009',
  'PayRight Europe Ltd',
  'FRN-900009',
  'PS25_EMI',
  'ACTIVE',
  'GBP',
  'SEGREGATION',
  1.50,
  50000.00,
  true,
  '2021-07-01',
  NOW(),
  NOW()
),
-- 10. QuickSend Ltd — PI, £1.5M, GBP only, GREEN
(
  '00000010-0010-4010-a010-000000000010',
  'QuickSend Ltd',
  'FRN-900010',
  'PS25_PI',
  'ACTIVE',
  'GBP',
  'SEGREGATION',
  2.00,
  10000.00,
  true,
  '2023-11-01',
  NOW(),
  NOW()
);

-- =============================================================================
-- BANK INSTITUTION — ClearBridge Bank (ClearBank-style BaaS, PILOT)
-- =============================================================================

INSERT INTO bank_institutions (
  id, name, lei_code, status, pilot_start_date, commercial_status,
  created_at, updated_at
) VALUES
(
  'b4000001-0004-4004-a004-000000000001',
  'ClearBridge Bank',
  'CLEARBRIDGEBANK00001',
  'ACTIVE',
  '2025-09-01',
  'PILOT',
  NOW(),
  NOW()
);

-- =============================================================================
-- BANK_VIEWER USERS
-- =============================================================================

-- viewer@testbank-uk.com — TestBank UK dashboard viewer (per spec)
-- (TestBank UK bank_institution_id = 'b3000001-0003-4003-a003-000000000001' from seed_01)
INSERT INTO users (
  id, firm_id, email, password_hash, role, name, status,
  bank_institution_id, created_at
) VALUES
(
  'a3100001-0031-4031-a031-000000000001',
  '00000000-0000-0000-0000-000000000010',   -- Safeheld System firm
  'viewer@testbank-uk.com',
  crypt('Test@Safeheld2024!', gen_salt('bf', 12)),
  'BANK_VIEWER',
  'TestBank UK Dashboard Viewer',
  'ACTIVE',
  'b3000001-0003-4003-a003-000000000001',
  NOW()
),
-- viewer@clearbridge-bank.com — ClearBridge Bank dashboard viewer
(
  'a4100001-0041-4041-a041-000000000001',
  '00000000-0000-0000-0000-000000000010',   -- Safeheld System firm
  'viewer@clearbridge-bank.com',
  crypt('Test@Safeheld2024!', gen_salt('bf', 12)),
  'BANK_VIEWER',
  'ClearBridge Bank Dashboard Viewer',
  'ACTIVE',
  'b4000001-0004-4004-a004-000000000001',
  NOW()
);

-- =============================================================================
-- USERS — EuroRemit Ltd
-- =============================================================================

INSERT INTO users (id, firm_id, email, password_hash, role, name, status, created_at) VALUES
(
  'a3500001-0003-4003-a003-000000000001',
  '00000003-0003-4003-a003-000000000003',
  'compliance@euroremit.example.com',
  crypt('Test@Safeheld2024!', gen_salt('bf', 12)),
  'COMPLIANCE_OFFICER',
  'Elena Compliance',
  'ACTIVE',
  NOW()
),
(
  'a3500002-0003-4003-a003-000000000002',
  '00000003-0003-4003-a003-000000000003',
  'finance@euroremit.example.com',
  crypt('Test@Safeheld2024!', gen_salt('bf', 12)),
  'FINANCE_OPS',
  'Anton Finance',
  'ACTIVE',
  NOW()
);

-- =============================================================================
-- USERS — SwiftPay Solutions Ltd
-- =============================================================================

INSERT INTO users (id, firm_id, email, password_hash, role, name, status, created_at) VALUES
(
  'a4000001-0004-4004-a004-000000000001',
  '00000004-0004-4004-a004-000000000004',
  'compliance@swiftpay.example.com',
  crypt('Test@Safeheld2024!', gen_salt('bf', 12)),
  'COMPLIANCE_OFFICER',
  'Sandra Compliance',
  'ACTIVE',
  NOW()
);

-- =============================================================================
-- USERS — GlobalMoney Ltd
-- =============================================================================

INSERT INTO users (id, firm_id, email, password_hash, role, name, status, created_at) VALUES
(
  'a5000001-0005-4005-a005-000000000001',
  '00000005-0005-4005-a005-000000000005',
  'compliance@globalmoney.example.com',
  crypt('Test@Safeheld2024!', gen_salt('bf', 12)),
  'COMPLIANCE_OFFICER',
  'George Compliance',
  'ACTIVE',
  NOW()
),
(
  'a5000002-0005-4005-a005-000000000005',
  '00000005-0005-4005-a005-000000000005',
  'finance@globalmoney.example.com',
  crypt('Test@Safeheld2024!', gen_salt('bf', 12)),
  'FINANCE_OPS',
  'Priya Finance',
  'ACTIVE',
  NOW()
);

-- =============================================================================
-- USERS — Apex Payments Group
-- =============================================================================

INSERT INTO users (id, firm_id, email, password_hash, role, name, status, created_at) VALUES
(
  'a6000001-0006-4006-a006-000000000001',
  '00000006-0006-4006-a006-000000000006',
  'compliance@apexpayments.example.com',
  crypt('Test@Safeheld2024!', gen_salt('bf', 12)),
  'COMPLIANCE_OFFICER',
  'Natasha Compliance',
  'ACTIVE',
  NOW()
),
(
  'a6000002-0006-4006-a006-000000000006',
  '00000006-0006-4006-a006-000000000006',
  'finance@apexpayments.example.com',
  crypt('Test@Safeheld2024!', gen_salt('bf', 12)),
  'FINANCE_OPS',
  'Oliver Finance',
  'ACTIVE',
  NOW()
),
(
  'a6000003-0006-4006-a006-000000000003',
  '00000006-0006-4006-a006-000000000006',
  'auditor@apexpayments.example.com',
  crypt('Test@Safeheld2024!', gen_salt('bf', 12)),
  'AUDITOR',
  'Fiona Auditor',
  'ACTIVE',
  NOW()
);

-- =============================================================================
-- USERS — NovaPay Ltd
-- =============================================================================

INSERT INTO users (id, firm_id, email, password_hash, role, name, status, created_at) VALUES
(
  'a7000001-0007-4007-a007-000000000001',
  '00000007-0007-4007-a007-000000000007',
  'compliance@novapay.example.com',
  crypt('Test@Safeheld2024!', gen_salt('bf', 12)),
  'COMPLIANCE_OFFICER',
  'Noah Compliance',
  'ACTIVE',
  NOW()
);

-- =============================================================================
-- USERS — MegaTransfer International
-- =============================================================================

INSERT INTO users (id, firm_id, email, password_hash, role, name, status, created_at) VALUES
(
  'a8000001-0008-4008-a008-000000000001',
  '00000008-0008-4008-a008-000000000008',
  'compliance@megatransfer.example.com',
  crypt('Test@Safeheld2024!', gen_salt('bf', 12)),
  'COMPLIANCE_OFFICER',
  'Marcus Compliance',
  'ACTIVE',
  NOW()
),
(
  'a8000002-0008-4008-a008-000000000002',
  '00000008-0008-4008-a008-000000000008',
  'finance@megatransfer.example.com',
  crypt('Test@Safeheld2024!', gen_salt('bf', 12)),
  'FINANCE_OPS',
  'Ingrid Finance',
  'ACTIVE',
  NOW()
),
(
  'a8000003-0008-4008-a008-000000000003',
  '00000008-0008-4008-a008-000000000008',
  'auditor@megatransfer.example.com',
  crypt('Test@Safeheld2024!', gen_salt('bf', 12)),
  'AUDITOR',
  'Charles Auditor',
  'ACTIVE',
  NOW()
);

-- =============================================================================
-- USERS — PayRight Europe Ltd
-- =============================================================================

INSERT INTO users (id, firm_id, email, password_hash, role, name, status, created_at) VALUES
(
  'a9000001-0009-4009-a009-000000000001',
  '00000009-0009-4009-a009-000000000009',
  'compliance@payright.example.com',
  crypt('Test@Safeheld2024!', gen_salt('bf', 12)),
  'COMPLIANCE_OFFICER',
  'Patricia Compliance',
  'ACTIVE',
  NOW()
),
(
  'a9000002-0009-4009-a009-000000000002',
  '00000009-0009-4009-a009-000000000009',
  'finance@payright.example.com',
  crypt('Test@Safeheld2024!', gen_salt('bf', 12)),
  'FINANCE_OPS',
  'Luc Finance',
  'ACTIVE',
  NOW()
);

-- =============================================================================
-- USERS — QuickSend Ltd
-- =============================================================================

INSERT INTO users (id, firm_id, email, password_hash, role, name, status, created_at) VALUES
(
  'a0000001-0010-4010-a010-000000000001',
  '00000010-0010-4010-a010-000000000010',
  'compliance@quicksend.example.com',
  crypt('Test@Safeheld2024!', gen_salt('bf', 12)),
  'COMPLIANCE_OFFICER',
  'Quinn Compliance',
  'ACTIVE',
  NOW()
);

-- =============================================================================
-- BANK_INSTITUTION_FIRMS — TestBank UK links (firms 3-7)
-- bank_institution_id = 'b3000001-0003-4003-a003-000000000001' (from seed_01)
-- =============================================================================

INSERT INTO bank_institution_firms (
  id, bank_institution_id, firm_id, safeguarding_account_count,
  total_funds_held, created_at
) VALUES
-- EuroRemit Ltd — 5 accounts, ~£12M GBP-equivalent
(
  'b1f00003-0003-4003-a003-000000000003',
  'b3000001-0003-4003-a003-000000000001',
  '00000003-0003-4003-a003-000000000003',
  5,
  12060000.00,
  NOW()
),
-- SwiftPay Solutions Ltd — 1 account, £800K
(
  'b1f00004-0004-4004-a004-000000000004',
  'b3000001-0003-4003-a003-000000000001',
  '00000004-0004-4004-a004-000000000004',
  1,
  800000.00,
  NOW()
),
-- GlobalMoney Ltd — 8 accounts across 2 banks, ~£28M GBP-equivalent
(
  'b1f00005-0005-4005-a005-000000000005',
  'b3000001-0003-4003-a003-000000000001',
  '00000005-0005-4005-a005-000000000005',
  8,
  28000000.00,
  NOW()
),
-- Apex Payments Group — 25 accounts across 5 banks, £520M GBP-equivalent
(
  'b1f00006-0006-4006-a006-000000000006',
  'b3000001-0003-4003-a003-000000000001',
  '00000006-0006-4006-a006-000000000006',
  25,
  520000000.00,
  NOW()
),
-- NovaPay Ltd — 1 account, £180K
(
  'b1f00007-0007-4007-a007-000000000007',
  'b3000001-0003-4003-a003-000000000001',
  '00000007-0007-4007-a007-000000000007',
  1,
  180000.00,
  NOW()
);

-- =============================================================================
-- BANK_INSTITUTION_FIRMS — ClearBridge Bank links (firms 8-10)
-- =============================================================================

INSERT INTO bank_institution_firms (
  id, bank_institution_id, firm_id, safeguarding_account_count,
  total_funds_held, created_at
) VALUES
-- MegaTransfer International — 30 accounts across 5 banks, £780M GBP-equivalent
(
  'b1f00008-0008-4008-a008-000000000008',
  'b4000001-0004-4004-a004-000000000001',
  '00000008-0008-4008-a008-000000000008',
  30,
  780000000.00,
  NOW()
),
-- PayRight Europe Ltd — 15 accounts across 4 banks, £95M GBP-equivalent
(
  'b1f00009-0009-4009-a009-000000000009',
  'b4000001-0004-4004-a004-000000000001',
  '00000009-0009-4009-a009-000000000009',
  15,
  95000000.00,
  NOW()
),
-- QuickSend Ltd — 2 accounts, £1.5M
(
  'b1f00010-0010-4010-a010-000000000010',
  'b4000001-0004-4004-a004-000000000001',
  '00000010-0010-4010-a010-000000000010',
  2,
  1500000.00,
  NOW()
);

-- =============================================================================
-- RESPONSIBILITY ASSIGNMENTS
-- =============================================================================

INSERT INTO responsibility_assignments (
  id, firm_id, role_type, person_name, job_title, smf_function,
  effective_from, approved_by, approval_date, created_at, updated_at
) VALUES
('da000003-0003-4003-a003-000000000001','00000003-0003-4003-a003-000000000003','SAFEGUARDING_OWNER','Elena Compliance','Chief Compliance Officer','SMF16','2022-09-01','Board of Directors','2022-08-25',NOW(),NOW()),
('da000004-0004-4004-a004-000000000001','00000004-0004-4004-a004-000000000004','SAFEGUARDING_OWNER','Sandra Compliance','Head of Compliance','SMF16','2023-04-01','Board of Directors','2023-03-28',NOW(),NOW()),
('da000005-0005-4005-a005-000000000001','00000005-0005-4005-a005-000000000005','SAFEGUARDING_OWNER','George Compliance','Chief Compliance Officer','SMF16','2021-11-01','Board of Directors','2021-10-28',NOW(),NOW()),
('da000006-0006-4006-a006-000000000001','00000006-0006-4006-a006-000000000006','SAFEGUARDING_OWNER','Natasha Compliance','Group Chief Compliance Officer','SMF16','2019-06-01','Group Board','2019-05-28',NOW(),NOW()),
('da000006-0006-4006-a006-000000000002','00000006-0006-4006-a006-000000000006','MLRO','David Risk','Money Laundering Reporting Officer','SMF17','2019-06-01','Group Board','2019-05-28',NOW(),NOW()),
('da000007-0007-4007-a007-000000000001','00000007-0007-4007-a007-000000000007','SAFEGUARDING_OWNER','Noah Compliance','Director of Compliance','SMF16','2024-03-01','Board of Directors','2024-02-26',NOW(),NOW()),
('da000008-0008-4008-a008-000000000001','00000008-0008-4008-a008-000000000008','SAFEGUARDING_OWNER','Marcus Compliance','Group Chief Compliance Officer','SMF16','2018-03-01','Group Board','2018-02-20',NOW(),NOW()),
('da000008-0008-4008-a008-000000000002','00000008-0008-4008-a008-000000000008','MLRO','Helena Risk','Group MLRO','SMF17','2018-03-01','Group Board','2018-02-20',NOW(),NOW()),
('da000009-0009-4009-a009-000000000001','00000009-0009-4009-a009-000000000009','SAFEGUARDING_OWNER','Patricia Compliance','Chief Compliance Officer','SMF16','2021-07-01','Board of Directors','2021-06-28',NOW(),NOW()),
('da000010-0010-4010-a010-000000000001','00000010-0010-4010-a010-000000000010','SAFEGUARDING_OWNER','Quinn Compliance','Director','SMF16','2023-11-01','Board of Directors','2023-10-28',NOW(),NOW());
