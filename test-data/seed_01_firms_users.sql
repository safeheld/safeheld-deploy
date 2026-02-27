-- =============================================================================
-- SEED 01: Firms, Users, and Bank Institution
-- Run this BEFORE uploading any CSV files.
-- =============================================================================
-- Required extension for bcrypt password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- FIRMS
-- =============================================================================

INSERT INTO firms (
  id, name, fca_frn, regime, status, base_currency,
  safeguarding_method, material_discrepancy_pct, material_discrepancy_abs,
  dpa_signed, dpa_signed_date, created_at, updated_at
) VALUES
(
  '00000001-0001-4001-a001-000000000001',
  'PayFlow Ltd',
  'FRN-900001',
  'PS25_EMI',
  'ACTIVE',
  'GBP',
  'SEGREGATION',
  1.50,          -- 1.5% material discrepancy threshold
  50000.00,      -- £50k absolute material discrepancy threshold
  true,
  '2022-01-15',
  NOW(),
  NOW()
),
(
  '00000002-0002-4002-a002-000000000002',
  'TransferQuick Ltd',
  'FRN-900002',
  'PS25_PI',
  'ACTIVE',
  'GBP',
  'SEGREGATION',
  2.00,          -- 2.0% material discrepancy threshold
  25000.00,      -- £25k absolute material discrepancy threshold
  true,
  '2023-06-01',
  NOW(),
  NOW()
);

-- =============================================================================
-- USERS — PayFlow Ltd
-- =============================================================================

INSERT INTO users (
  id, firm_id, email, password_hash, role, name, status, created_at
) VALUES
(
  'a1000001-0001-4001-a001-000000000001',
  '00000001-0001-4001-a001-000000000001',
  'compliance@payflow.example.com',
  crypt('Test@Safeheld2024!', gen_salt('bf', 12)),
  'COMPLIANCE_OFFICER',
  'Sarah Compliance',
  'ACTIVE',
  NOW()
),
(
  'a1000002-0001-4001-a001-000000000002',
  '00000001-0001-4001-a001-000000000001',
  'finance@payflow.example.com',
  crypt('Test@Safeheld2024!', gen_salt('bf', 12)),
  'FINANCE_OPS',
  'James Finance',
  'ACTIVE',
  NOW()
),
(
  'a1000003-0001-4001-a001-000000000003',
  '00000001-0001-4001-a001-000000000001',
  'auditor@payflow.example.com',
  crypt('Test@Safeheld2024!', gen_salt('bf', 12)),
  'AUDITOR',
  'Rachel Auditor',
  'ACTIVE',
  NOW()
);

-- =============================================================================
-- USERS — TransferQuick Ltd
-- =============================================================================

INSERT INTO users (
  id, firm_id, email, password_hash, role, name, status, created_at
) VALUES
(
  'a2000001-0002-4002-a002-000000000001',
  '00000002-0002-4002-a002-000000000002',
  'compliance@transferquick.example.com',
  crypt('Test@Safeheld2024!', gen_salt('bf', 12)),
  'COMPLIANCE_OFFICER',
  'Michael Compliance',
  'ACTIVE',
  NOW()
),
(
  'a2000002-0002-4002-a002-000000000002',
  '00000002-0002-4002-a002-000000000002',
  'finance@transferquick.example.com',
  crypt('Test@Safeheld2024!', gen_salt('bf', 12)),
  'FINANCE_OPS',
  'Lisa Finance',
  'ACTIVE',
  NOW()
);

-- =============================================================================
-- BANK INSTITUTION — TestBank UK
-- =============================================================================

INSERT INTO bank_institutions (
  id, name, lei_code, status, pilot_start_date, commercial_status,
  created_at, updated_at
) VALUES
(
  'b3000001-0003-4003-a003-000000000001',
  'TestBank UK',
  'TESTBANKUK0000000001',
  'ACTIVE',
  '2025-06-01',
  'PILOT',
  NOW(),
  NOW()
);

-- BANK_VIEWER user for TestBank UK
-- (firm_id = system admin firm, bank_institution_id links this user to the bank)
INSERT INTO users (
  id, firm_id, email, password_hash, role, name, status,
  bank_institution_id, created_at
) VALUES
(
  'a3000001-0003-4003-a003-000000000001',
  '00000000-0000-0000-0000-000000000010',   -- Safeheld System firm (from main seed)
  'viewer@testbank.example.com',
  crypt('Test@Safeheld2024!', gen_salt('bf', 12)),
  'BANK_VIEWER',
  'TestBank Dashboard User',
  'ACTIVE',
  'b3000001-0003-4003-a003-000000000001',
  NOW()
);

-- Link PayFlow Ltd to TestBank UK (Barclays and HSBC accounts are "held at" TestBank UK
-- for dashboard aggregation purposes — adjust the safeguarding_account_count and
-- total_funds_held after CSV data is loaded, or leave at placeholder values)
INSERT INTO bank_institution_firms (
  id, bank_institution_id, firm_id, safeguarding_account_count,
  total_funds_held, created_at
) VALUES
(
  'b1f00001-0001-4001-a001-000000000001',
  'b3000001-0003-4003-a003-000000000001',
  '00000001-0001-4001-a001-000000000001',
  8,           -- 8 of PayFlow's 12 accounts held at TestBank UK banks
  28200000.00, -- GBP-equivalent safeguarding funds (placeholder; update after recon)
  NOW()
);
