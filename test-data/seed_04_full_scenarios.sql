-- =============================================================================
-- SEED 04: Scenarios for 8 new firms — breach records, letter statuses,
--          DD records, and resolution pack health checks.
-- Run AFTER seed_03_full_tenants.sql AND after all CSV files have been uploaded.
-- =============================================================================

-- =============================================================================
-- EUROREMIT LTD — AMBER
-- Scenario A: GBP internal recon EXCESS (£60,000 = 0.86%) — below material threshold,
--             no automated breach, but EXCESS status flags AMBER.
-- Scenario B: Nationwide EUR account (SA-ER-NWI-EUR-01) has an ack letter
--             expiring in 20 days (2026-03-18). Account letter_status = CONFIRMED.
-- =============================================================================

-- Set letter_status on all EuroRemit accounts to CONFIRMED (baseline)
UPDATE safeguarding_accounts
SET    letter_status = 'CONFIRMED'
WHERE  firm_id = '00000003-0003-4003-a003-000000000003';

-- Seed the expiring acknowledgement letter for Nationwide EUR account
INSERT INTO acknowledgement_letters (
  id, firm_id, safeguarding_account_id, version,
  file_storage_path, file_hash,
  upload_date, effective_date, expiry_date, annual_review_due,
  status, uploaded_by, created_at
) VALUES (
  'a1000001-0003-4003-a003-000000000001',
  '00000003-0003-4003-a003-000000000003',
  (SELECT id FROM safeguarding_accounts
   WHERE firm_id = '00000003-0003-4003-a003-000000000003'
     AND external_account_id = 'SA-ER-NWI-EUR-01'),
  1,
  'letters/euroremit/SA-ER-NWI-EUR-01-v1.pdf',
  'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  '2025-03-20',
  '2025-03-20',
  '2026-03-18',           -- expiring in 20 days from 2026-02-26
  '2026-03-18',
  'CURRENT',
  'a3500001-0003-4003-a003-000000000001',
  NOW() - INTERVAL '11 months'
);

-- Seed ack letters for the other 4 EuroRemit accounts (all current, renewal due next year)
INSERT INTO acknowledgement_letters (
  id, firm_id, safeguarding_account_id, version,
  file_storage_path, file_hash,
  upload_date, effective_date, expiry_date, annual_review_due,
  status, uploaded_by, created_at
) VALUES
(
  'a1000002-0003-4003-a003-000000000002',
  '00000003-0003-4003-a003-000000000003',
  (SELECT id FROM safeguarding_accounts WHERE firm_id = '00000003-0003-4003-a003-000000000003' AND external_account_id = 'SA-ER-NWI-GBP-01'),
  1, 'letters/euroremit/SA-ER-NWI-GBP-01-v1.pdf', 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
  '2025-09-10', '2025-09-10', '2026-09-10', '2026-09-10', 'CURRENT',
  'a3500001-0003-4003-a003-000000000001', NOW() - INTERVAL '5 months'
),
(
  'a1000003-0003-4003-a003-000000000003',
  '00000003-0003-4003-a003-000000000003',
  (SELECT id FROM safeguarding_accounts WHERE firm_id = '00000003-0003-4003-a003-000000000003' AND external_account_id = 'SA-ER-NWS-GBP-01'),
  1, 'letters/euroremit/SA-ER-NWS-GBP-01-v1.pdf', 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
  '2025-09-10', '2025-09-10', '2026-09-10', '2026-09-10', 'CURRENT',
  'a3500001-0003-4003-a003-000000000001', NOW() - INTERVAL '5 months'
),
(
  'a1000004-0003-4003-a003-000000000004',
  '00000003-0003-4003-a003-000000000003',
  (SELECT id FROM safeguarding_accounts WHERE firm_id = '00000003-0003-4003-a003-000000000003' AND external_account_id = 'SA-ER-NWS-EUR-01'),
  1, 'letters/euroremit/SA-ER-NWS-EUR-01-v1.pdf', 'd4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5',
  '2025-09-10', '2025-09-10', '2026-09-10', '2026-09-10', 'CURRENT',
  'a3500001-0003-4003-a003-000000000001', NOW() - INTERVAL '5 months'
),
(
  'a1000005-0003-4003-a003-000000000005',
  '00000003-0003-4003-a003-000000000003',
  (SELECT id FROM safeguarding_accounts WHERE firm_id = '00000003-0003-4003-a003-000000000003' AND external_account_id = 'SA-ER-LBG-GBP-01'),
  1, 'letters/euroremit/SA-ER-LBG-GBP-01-v1.pdf', 'e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
  '2025-09-10', '2025-09-10', '2026-09-10', '2026-09-10', 'CURRENT',
  'a3500001-0003-4003-a003-000000000001', NOW() - INTERVAL '5 months'
);

-- DD records for EuroRemit (all CURRENT)
INSERT INTO third_party_due_diligence (
  id, firm_id, safeguarding_account_id, bank_name,
  initial_dd_date, last_review_date, next_review_due,
  review_status, creditworthiness_assessment, diversification_considered,
  dd_outcome, created_at, updated_at
) VALUES
(
  'dd000003-0003-4003-a003-000000000001',
  '00000003-0003-4003-a003-000000000003',
  (SELECT id FROM safeguarding_accounts WHERE firm_id = '00000003-0003-4003-a003-000000000003' AND external_account_id = 'SA-ER-NWI-GBP-01'),
  'Nationwide Building Society', '2022-09-01', '2025-09-01', '2026-09-01',
  'CURRENT', 'Nationwide Building Society (FCA authorised). Strong capital position. No adverse findings.',
  true, 'APPROVED', NOW() - INTERVAL '5 months', NOW()
),
(
  'dd000003-0003-4003-a003-000000000002',
  '00000003-0003-4003-a003-000000000003',
  (SELECT id FROM safeguarding_accounts WHERE firm_id = '00000003-0003-4003-a003-000000000003' AND external_account_id = 'SA-ER-NWS-GBP-01'),
  'NatWest Bank PLC', '2023-03-15', '2025-03-15', '2026-03-15',
  'CURRENT', 'NatWest Bank PLC (FCA authorised bank). Rated investment grade.',
  true, 'APPROVED', NOW() - INTERVAL '11 months', NOW()
),
(
  'dd000003-0003-4003-a003-000000000003',
  '00000003-0003-4003-a003-000000000003',
  (SELECT id FROM safeguarding_accounts WHERE firm_id = '00000003-0003-4003-a003-000000000003' AND external_account_id = 'SA-ER-LBG-GBP-01'),
  'Lloyds Bank PLC', '2023-06-20', '2025-06-20', '2026-06-20',
  'CURRENT', 'Lloyds Bank PLC (FCA authorised). Strong capital adequacy.',
  true, 'APPROVED', NOW() - INTERVAL '8 months', NOW()
);

-- Resolution pack health — EuroRemit (AMBER: expiring letter warning)
INSERT INTO resolution_pack_health (
  id, firm_id, check_date, overall_status, components, missing_components, created_at
) VALUES (
  'd1000003-0003-4003-a003-000000000001',
  '00000003-0003-4003-a003-000000000003',
  CURRENT_DATE,
  'AMBER',
  '{
    "safeguarding_policy": "GREEN",
    "reconciliation_procedure": "GREEN",
    "breach_procedure": "GREEN",
    "wind_down_plan": "GREEN",
    "acknowledgement_letters": "AMBER",
    "third_party_dd": "GREEN",
    "responsibility_assignments": "GREEN",
    "client_contracts": "GREEN"
  }',
  '["acknowledgement_letters: SA-ER-NWI-EUR-01 letter expires 2026-03-18 (20 days)"]',
  NOW()
);

-- =============================================================================
-- SWIFTPAY SOLUTIONS LTD — RED
-- Scenario A: MISSING_DATA — client balance data is 4 business days stale
--             (last uploaded 2026-02-20, threshold is 3 days → RED).
-- Scenario B: DD_OVERDUE — Starling Bank annual review due 2025-04-15, now overdue.
-- =============================================================================

-- Insert DD records for SwiftPay (Starling: OVERDUE)
INSERT INTO third_party_due_diligence (
  id, firm_id, safeguarding_account_id, bank_name,
  initial_dd_date, last_review_date, next_review_due,
  review_status, creditworthiness_assessment, diversification_considered,
  dd_outcome, created_at, updated_at
) VALUES (
  'dd000004-0004-4004-a004-000000000001',
  '00000004-0004-4004-a004-000000000004',
  (SELECT id FROM safeguarding_accounts
   WHERE firm_id = '00000004-0004-4004-a004-000000000004'
     AND external_account_id = 'SA-SP-STL-GBP-01'),
  'Starling Bank',
  '2023-04-15',
  '2024-04-10',
  '2025-04-10',         -- overdue since April 2025 — 10+ months overdue
  'OVERDUE',
  'Starling Bank (FCA authorised e-money institution). Initial DD satisfactory. '
  'Note: annual review now overdue by 10+ months. Updated creditworthiness '
  'assessment required. £800,000 GBP client funds held.',
  false,
  'APPROVED',
  '2023-04-15 10:00:00',
  NOW()
);

-- Insert MISSING_DATA breach (stale data — balance date 2026-02-20, today 2026-02-26 = 4 business days)
INSERT INTO breaches (
  id, firm_id, breach_type, severity, is_notifiable,
  material_discrepancy_exceeded, currency, shortfall_amount, shortfall_percentage,
  description, status, version, created_at
) VALUES (
  'b0000004-0004-4004-a004-000000000001',
  '00000004-0004-4004-a004-000000000004',
  'MISSING_DATA',
  'HIGH',
  true,
  false,
  'GBP',
  NULL,
  NULL,
  'Client balance data for SwiftPay Solutions Ltd has not been uploaded for 4 business '
  'days. Last data received: 2026-02-20. Under PS25 regulation, reconciliation must '
  'be performed on each business day for which the firm holds client funds. '
  'Threshold: 3 business days. The firm holds £800,000 GBP of client funds across '
  '1 safeguarding account (SA-SP-STL-GBP-01, Starling Bank). Compliance Officer must '
  'immediately upload current client balances and trigger reconciliation.',
  'DETECTED',
  1,
  NOW() - INTERVAL '1 day'
),
(
  'b0000004-0004-4004-a004-000000000002',
  '00000004-0004-4004-a004-000000000004',
  'DD_OVERDUE',
  'MEDIUM',
  false,
  false,
  NULL,
  NULL,
  NULL,
  'Annual due diligence review for Starling Bank (safeguarding account SA-SP-STL-GBP-01) '
  'is overdue by 10+ months. Last review completed: 2024-04-10. '
  'Next review was due: 2025-04-10. Under PS25 regulation, safeguarding institutions '
  'must be subject to annual creditworthiness assessment. £800,000 GBP held at this '
  'institution. Assign a responsible officer to complete the DD review.',
  'DETECTED',
  1,
  NOW() - INTERVAL '14 days'
);

-- Resolution pack — SwiftPay (RED)
INSERT INTO resolution_pack_health (
  id, firm_id, check_date, overall_status, components, missing_components, created_at
) VALUES (
  'd1000004-0004-4004-a004-000000000001',
  '00000004-0004-4004-a004-000000000004',
  CURRENT_DATE,
  'RED',
  '{
    "safeguarding_policy": "GREEN",
    "reconciliation_procedure": "GREEN",
    "breach_procedure": "GREEN",
    "wind_down_plan": "GREEN",
    "acknowledgement_letters": "GREEN",
    "third_party_dd": "RED",
    "responsibility_assignments": "GREEN",
    "client_contracts": "GREEN"
  }',
  '["third_party_dd: SA-SP-STL-GBP-01 Starling Bank review overdue 10+ months", "data_completeness: client balances stale 4 business days"]',
  NOW()
);

-- =============================================================================
-- GLOBALMONEY LTD — AMBER
-- GBP internal recon SHORTFALL: Client £16,000,000 > Safeguarding ledger £15,760,000
-- Shortfall: £240,000 = 1.50% → MEDIUM severity (>= materialDiscrepancyPct 1.5%)
-- EUR and USD: balanced.
-- Pre-seeded breach (will also be auto-detected when reconciliation runs).
-- =============================================================================

INSERT INTO breaches (
  id, firm_id, breach_type, severity, is_notifiable,
  material_discrepancy_exceeded, currency, shortfall_amount, shortfall_percentage,
  description, status, version, created_at
) VALUES (
  'b0000005-0005-4005-a005-000000000001',
  '00000005-0005-4005-a005-000000000005',
  'SHORTFALL',
  'MEDIUM',
  false,
  true,
  'GBP',
  240000.00,
  1.5000,
  'Internal reconciliation shortfall detected for GBP as at 2026-02-24. '
  'Total client funds (requirement): £16,000,000.00 GBP. '
  'Total safeguarding ledger (resource): £15,760,000.00 GBP. '
  'Shortfall: £240,000.00 (1.50%). This meets the material discrepancy threshold '
  'of 1.50% / £100,000. Severity: MEDIUM. Distributed across 4 GBP accounts at '
  'Barclays Bank PLC (SA-GM-BRL-GBP-01, SA-GM-BRL-GBP-02) and HSBC Bank PLC '
  '(SA-GM-HSBC-GBP-01, SA-GM-HSBC-GBP-02). '
  'Compliance Officer must acknowledge within 24 hours and initiate remediation.',
  'DETECTED',
  1,
  NOW() - INTERVAL '12 hours'
);

-- DD records for GlobalMoney (all CURRENT)
INSERT INTO third_party_due_diligence (
  id, firm_id, safeguarding_account_id, bank_name,
  initial_dd_date, last_review_date, next_review_due,
  review_status, creditworthiness_assessment, diversification_considered,
  dd_outcome, created_at, updated_at
) VALUES
(
  'dd000005-0005-4005-a005-000000000001',
  '00000005-0005-4005-a005-000000000005',
  (SELECT id FROM safeguarding_accounts WHERE firm_id = '00000005-0005-4005-a005-000000000005' AND external_account_id = 'SA-GM-BRL-GBP-01'),
  'Barclays Bank PLC', '2021-11-15', '2025-11-10', '2026-11-10',
  'CURRENT', 'Barclays Bank PLC (FCA authorised). Strong capital adequacy. Rated AA-.',
  true, 'APPROVED', '2021-11-15 10:00:00', NOW()
),
(
  'dd000005-0005-4005-a005-000000000002',
  '00000005-0005-4005-a005-000000000005',
  (SELECT id FROM safeguarding_accounts WHERE firm_id = '00000005-0005-4005-a005-000000000005' AND external_account_id = 'SA-GM-HSBC-GBP-01'),
  'HSBC Bank PLC', '2022-03-01', '2025-02-25', '2026-02-25',
  'CURRENT', 'HSBC Bank PLC (FCA authorised). Strong capital position. Globally systemically important.',
  true, 'APPROVED', '2022-03-01 10:00:00', NOW()
);

-- Resolution pack — GlobalMoney (AMBER)
INSERT INTO resolution_pack_health (
  id, firm_id, check_date, overall_status, components, missing_components, created_at
) VALUES (
  'd1000005-0005-4005-a005-000000000001',
  '00000005-0005-4005-a005-000000000005',
  CURRENT_DATE,
  'AMBER',
  '{
    "safeguarding_policy": "GREEN",
    "reconciliation_procedure": "GREEN",
    "breach_procedure": "GREEN",
    "wind_down_plan": "GREEN",
    "acknowledgement_letters": "GREEN",
    "third_party_dd": "GREEN",
    "responsibility_assignments": "GREEN",
    "client_contracts": "GREEN"
  }',
  '["internal_reconciliation: GBP shortfall £240,000 (1.50%) - MEDIUM severity"]',
  NOW()
);

-- =============================================================================
-- APEX PAYMENTS GROUP — GREEN (no breaches)
-- =============================================================================

-- DD records for Apex (all CURRENT — 5 banks × 1 DD record each)
INSERT INTO third_party_due_diligence (
  id, firm_id, safeguarding_account_id, bank_name,
  initial_dd_date, last_review_date, next_review_due,
  review_status, creditworthiness_assessment, diversification_considered,
  dd_outcome, created_at, updated_at
) VALUES
(
  'dd000006-0006-4006-a006-000000000001',
  '00000006-0006-4006-a006-000000000006',
  (SELECT id FROM safeguarding_accounts WHERE firm_id = '00000006-0006-4006-a006-000000000006' AND external_account_id = 'SA-AP-BRL-GBP-01'),
  'Barclays Bank PLC', '2019-06-15', '2025-06-10', '2026-06-10',
  'CURRENT', 'Barclays Bank PLC. Rated AA-. Strong capital. Group-level DD covers all Barclays accounts.',
  true, 'APPROVED', '2019-06-15 10:00:00', NOW()
),
(
  'dd000006-0006-4006-a006-000000000002',
  '00000006-0006-4006-a006-000000000006',
  (SELECT id FROM safeguarding_accounts WHERE firm_id = '00000006-0006-4006-a006-000000000006' AND external_account_id = 'SA-AP-HSBC-GBP-01'),
  'HSBC Bank PLC', '2019-06-15', '2025-06-10', '2026-06-10',
  'CURRENT', 'HSBC Bank PLC. G-SIB status. Strong capital adequacy ratio.',
  true, 'APPROVED', '2019-06-15 10:00:00', NOW()
),
(
  'dd000006-0006-4006-a006-000000000003',
  '00000006-0006-4006-a006-000000000006',
  (SELECT id FROM safeguarding_accounts WHERE firm_id = '00000006-0006-4006-a006-000000000006' AND external_account_id = 'SA-AP-LBG-GBP-01'),
  'Lloyds Bank PLC', '2019-09-01', '2025-09-01', '2026-09-01',
  'CURRENT', 'Lloyds Bank PLC. Ring-fenced bank. Strong retail deposit base.',
  true, 'APPROVED', '2019-09-01 10:00:00', NOW()
),
(
  'dd000006-0006-4006-a006-000000000004',
  '00000006-0006-4006-a006-000000000006',
  (SELECT id FROM safeguarding_accounts WHERE firm_id = '00000006-0006-4006-a006-000000000006' AND external_account_id = 'SA-AP-NWS-GBP-01'),
  'NatWest Bank PLC', '2020-06-01', '2025-06-01', '2026-06-01',
  'CURRENT', 'NatWest Bank PLC. Ring-fenced bank. Investment grade rated.',
  true, 'APPROVED', '2020-06-01 10:00:00', NOW()
),
(
  'dd000006-0006-4006-a006-000000000005',
  '00000006-0006-4006-a006-000000000006',
  (SELECT id FROM safeguarding_accounts WHERE firm_id = '00000006-0006-4006-a006-000000000006' AND external_account_id = 'SA-AP-SAN-GBP-01'),
  'Santander UK PLC', '2021-01-15', '2025-01-15', '2026-01-15',
  'CURRENT', 'Santander UK PLC. Ring-fenced entity. Strong capital ratios.',
  true, 'APPROVED', '2021-01-15 10:00:00', NOW()
);

-- Resolution pack — Apex (GREEN)
INSERT INTO resolution_pack_health (
  id, firm_id, check_date, overall_status, components, missing_components, created_at
) VALUES (
  'd1000006-0006-4006-a006-000000000001',
  '00000006-0006-4006-a006-000000000006',
  CURRENT_DATE,
  'GREEN',
  '{
    "safeguarding_policy": "GREEN",
    "reconciliation_procedure": "GREEN",
    "breach_procedure": "GREEN",
    "wind_down_plan": "GREEN",
    "acknowledgement_letters": "GREEN",
    "third_party_dd": "GREEN",
    "responsibility_assignments": "GREEN",
    "client_contracts": "GREEN"
  }',
  NULL,
  NOW()
);

-- =============================================================================
-- NOVAPAY LTD — GREEN (no breaches)
-- =============================================================================

-- DD record for NovaPay (CURRENT)
INSERT INTO third_party_due_diligence (
  id, firm_id, safeguarding_account_id, bank_name,
  initial_dd_date, last_review_date, next_review_due,
  review_status, creditworthiness_assessment, diversification_considered,
  dd_outcome, created_at, updated_at
) VALUES (
  'dd000007-0007-4007-a007-000000000001',
  '00000007-0007-4007-a007-000000000007',
  (SELECT id FROM safeguarding_accounts
   WHERE firm_id = '00000007-0007-4007-a007-000000000007'
     AND external_account_id = 'SA-NP-MON-GBP-01'),
  'Monzo Business Bank',
  '2024-03-15',
  '2025-03-15',
  '2026-03-15',
  'CURRENT',
  'Monzo Business Bank (FCA authorised e-money institution). Capital adequacy '
  'assessed as adequate. No adverse findings.',
  false,
  'APPROVED',
  '2024-03-15 10:00:00',
  NOW()
);

-- Resolution pack — NovaPay (GREEN)
INSERT INTO resolution_pack_health (
  id, firm_id, check_date, overall_status, components, missing_components, created_at
) VALUES (
  'd1000007-0007-4007-a007-000000000001',
  '00000007-0007-4007-a007-000000000007',
  CURRENT_DATE,
  'GREEN',
  '{
    "safeguarding_policy": "GREEN",
    "reconciliation_procedure": "GREEN",
    "breach_procedure": "GREEN",
    "wind_down_plan": "GREEN",
    "acknowledgement_letters": "GREEN",
    "third_party_dd": "GREEN",
    "responsibility_assignments": "GREEN",
    "client_contracts": "GREEN"
  }',
  NULL,
  NOW()
);

-- =============================================================================
-- MEGATRANSFER INTERNATIONAL — RED
-- CRITICAL breach: GBP internal recon SHORTFALL
-- Client £400,000,000 > Safeguarding ledger £378,900,000
-- Shortfall: £21,100,000 = 5.275% → CRITICAL (>= 5× materialDiscrepancyPct of 1%)
-- Breach detected 2 days ago (2026-02-24). is_notifiable = true.
-- All other currencies (EUR, USD, AED, SGD, HKD): balanced.
-- =============================================================================

INSERT INTO breaches (
  id, firm_id, breach_type, severity, is_notifiable,
  material_discrepancy_exceeded, currency, shortfall_amount, shortfall_percentage,
  description, status, version, created_at
) VALUES (
  'b0000008-0008-4008-a008-000000000001',
  '00000008-0008-4008-a008-000000000008',
  'SHORTFALL',
  'CRITICAL',
  true,
  true,
  'GBP',
  21100000.00,
  5.2750,
  'CRITICAL internal reconciliation shortfall detected for GBP as at 2026-02-24. '
  'Total client funds (requirement): £400,000,000.00 GBP across 120,000 client accounts. '
  'Total safeguarding ledger (resource): £378,900,000.00 GBP across 5 GBP safeguarding '
  'accounts (Citibank NA £85M, HSBC Bank PLC £78M, Barclays Bank PLC £75M, '
  'Deutsche Bank AG £72M, Standard Chartered Bank £68.9M). '
  'Shortfall: £21,100,000.00 (5.275%). This significantly exceeds the material '
  'discrepancy threshold of 1.00% / £500,000 and triggers CRITICAL severity. '
  'Severity threshold: 5× materialDiscrepancyPct (5.275% ≥ 5.0%). '
  'FCA notification required. Immediate escalation to Board and Group CEO. '
  'Compliance Officer must acknowledge within 2 hours. Root cause investigation '
  'must commence immediately. Possible causes: system migration error, bulk withdrawal '
  'processing delay, or data feed failure.',
  'DETECTED',
  1,
  NOW() - INTERVAL '2 days'
);

-- DD records for MegaTransfer (all CURRENT)
INSERT INTO third_party_due_diligence (
  id, firm_id, safeguarding_account_id, bank_name,
  initial_dd_date, last_review_date, next_review_due,
  review_status, creditworthiness_assessment, diversification_considered,
  dd_outcome, created_at, updated_at
) VALUES
(
  'dd000008-0008-4008-a008-000000000001',
  '00000008-0008-4008-a008-000000000008',
  (SELECT id FROM safeguarding_accounts WHERE firm_id = '00000008-0008-4008-a008-000000000008' AND external_account_id = 'SA-MT-CIT-GBP-01'),
  'Citibank NA London Branch', '2018-03-15', '2025-03-10', '2026-03-10',
  'CURRENT', 'Citibank NA (Global G-SIB). Rated AA-/Aa3. Strong capital adequacy.',
  true, 'APPROVED', '2018-03-15 10:00:00', NOW()
),
(
  'dd000008-0008-4008-a008-000000000002',
  '00000008-0008-4008-a008-000000000008',
  (SELECT id FROM safeguarding_accounts WHERE firm_id = '00000008-0008-4008-a008-000000000008' AND external_account_id = 'SA-MT-HSBC-GBP-01'),
  'HSBC Bank PLC', '2018-03-15', '2025-03-10', '2026-03-10',
  'CURRENT', 'HSBC Bank PLC. G-SIB. Rated AA-/Aa3.',
  true, 'APPROVED', '2018-03-15 10:00:00', NOW()
),
(
  'dd000008-0008-4008-a008-000000000003',
  '00000008-0008-4008-a008-000000000008',
  (SELECT id FROM safeguarding_accounts WHERE firm_id = '00000008-0008-4008-a008-000000000008' AND external_account_id = 'SA-MT-BRL-GBP-01'),
  'Barclays Bank PLC', '2018-06-01', '2025-06-01', '2026-06-01',
  'CURRENT', 'Barclays Bank PLC. G-SIB. Rated A/Aa3.',
  true, 'APPROVED', '2018-06-01 10:00:00', NOW()
),
(
  'dd000008-0008-4008-a008-000000000004',
  '00000008-0008-4008-a008-000000000008',
  (SELECT id FROM safeguarding_accounts WHERE firm_id = '00000008-0008-4008-a008-000000000008' AND external_account_id = 'SA-MT-DBK-GBP-01'),
  'Deutsche Bank AG London Branch', '2019-03-01', '2025-03-01', '2026-03-01',
  'CURRENT', 'Deutsche Bank AG. G-SIB. Rated BBB+/Baa2. Comprehensive DD conducted.',
  true, 'APPROVED', '2019-03-01 10:00:00', NOW()
),
(
  'dd000008-0008-4008-a008-000000000005',
  '00000008-0008-4008-a008-000000000008',
  (SELECT id FROM safeguarding_accounts WHERE firm_id = '00000008-0008-4008-a008-000000000008' AND external_account_id = 'SA-MT-SCB-GBP-01'),
  'Standard Chartered Bank', '2019-06-01', '2025-06-01', '2026-06-01',
  'CURRENT', 'Standard Chartered Bank (FCA authorised). Rated A/A1. Specialist in EM corridors.',
  true, 'APPROVED', '2019-06-01 10:00:00', NOW()
);

-- Resolution pack — MegaTransfer (RED)
INSERT INTO resolution_pack_health (
  id, firm_id, check_date, overall_status, components, missing_components, created_at
) VALUES (
  'd1000008-0008-4008-a008-000000000001',
  '00000008-0008-4008-a008-000000000008',
  CURRENT_DATE,
  'RED',
  '{
    "safeguarding_policy": "GREEN",
    "reconciliation_procedure": "GREEN",
    "breach_procedure": "GREEN",
    "wind_down_plan": "GREEN",
    "acknowledgement_letters": "GREEN",
    "third_party_dd": "GREEN",
    "responsibility_assignments": "GREEN",
    "client_contracts": "GREEN"
  }',
  '["internal_reconciliation: GBP CRITICAL shortfall £21,100,000 (5.275%) - FCA notification required"]',
  NOW()
);

-- =============================================================================
-- PAYRIGHT EUROPE LTD — AMBER
-- Scenario A: GBP internal recon EXCESS — Client £55M, Ledger £57.1M, excess £2.1M (3.82%)
--             (excess does not auto-trigger shortfall breach, but flags AMBER status)
-- Scenario B: SA-PR-DBK-EUR-01 (Deutsche Bank EUR) — LETTER_MISSING → HIGH breach
-- EUR: balanced (€35M client = €35M ledger).
-- =============================================================================

-- Set letter_status = MISSING on Deutsche Bank EUR account
UPDATE safeguarding_accounts
SET    letter_status = 'MISSING'
WHERE  firm_id = '00000009-0009-4009-a009-000000000009'
  AND  external_account_id = 'SA-PR-DBK-EUR-01';

-- Set all other PayRight accounts to CONFIRMED
UPDATE safeguarding_accounts
SET    letter_status = 'CONFIRMED'
WHERE  firm_id = '00000009-0009-4009-a009-000000000009'
  AND  external_account_id != 'SA-PR-DBK-EUR-01';

-- LETTER_MISSING breach for PayRight Deutsche Bank EUR account
INSERT INTO breaches (
  id, firm_id, breach_type, severity, is_notifiable,
  material_discrepancy_exceeded, currency, shortfall_amount, shortfall_percentage,
  description, status, version, created_at
) VALUES (
  'b0000009-0009-4009-a009-000000000001',
  '00000009-0009-4009-a009-000000000009',
  'LETTER_MISSING',
  'HIGH',
  true,
  false,
  'EUR',
  NULL,
  NULL,
  'No acknowledgement letter on file for Deutsche Bank AG London Branch EUR '
  'safeguarding account SA-PR-DBK-EUR-01 (****3302). Under PS25 regulation 10(3) '
  'and the firm''s safeguarding policy, a signed bank acknowledgement confirming '
  'safeguarding designation must be held on file at all times. This account has been '
  'active since 2022-01-15 with no letter uploaded. €5,000,000 EUR of client funds '
  'held at this account. Immediate action required: contact Deutsche Bank AG to '
  'obtain and upload a signed acknowledgement letter.',
  'DETECTED',
  1,
  NOW() - INTERVAL '5 days'
);

-- DD records for PayRight (all CURRENT — 4 banks)
INSERT INTO third_party_due_diligence (
  id, firm_id, safeguarding_account_id, bank_name,
  initial_dd_date, last_review_date, next_review_due,
  review_status, creditworthiness_assessment, diversification_considered,
  dd_outcome, created_at, updated_at
) VALUES
(
  'dd000009-0009-4009-a009-000000000001',
  '00000009-0009-4009-a009-000000000009',
  (SELECT id FROM safeguarding_accounts WHERE firm_id = '00000009-0009-4009-a009-000000000009' AND external_account_id = 'SA-PR-BRL-GBP-01'),
  'Barclays Bank PLC', '2021-07-15', '2025-07-10', '2026-07-10',
  'CURRENT', 'Barclays Bank PLC. Investment grade. Strong capital adequacy.', true, 'APPROVED', '2021-07-15 10:00:00', NOW()
),
(
  'dd000009-0009-4009-a009-000000000002',
  '00000009-0009-4009-a009-000000000009',
  (SELECT id FROM safeguarding_accounts WHERE firm_id = '00000009-0009-4009-a009-000000000009' AND external_account_id = 'SA-PR-NWS-GBP-01'),
  'NatWest Bank PLC', '2021-09-01', '2025-09-01', '2026-09-01',
  'CURRENT', 'NatWest Bank PLC. Ring-fenced. Investment grade.', true, 'APPROVED', '2021-09-01 10:00:00', NOW()
),
(
  'dd000009-0009-4009-a009-000000000003',
  '00000009-0009-4009-a009-000000000009',
  (SELECT id FROM safeguarding_accounts WHERE firm_id = '00000009-0009-4009-a009-000000000009' AND external_account_id = 'SA-PR-DBK-GBP-01'),
  'Deutsche Bank AG London Branch', '2022-01-15', '2025-01-10', '2026-01-10',
  'CURRENT', 'Deutsche Bank AG. G-SIB. Rated BBB+. LETTER MISSING on EUR account.', true, 'APPROVED', '2022-01-15 10:00:00', NOW()
),
(
  'dd000009-0009-4009-a009-000000000004',
  '00000009-0009-4009-a009-000000000009',
  (SELECT id FROM safeguarding_accounts WHERE firm_id = '00000009-0009-4009-a009-000000000009' AND external_account_id = 'SA-PR-SAN-GBP-01'),
  'Santander UK PLC', '2022-06-01', '2025-06-01', '2026-06-01',
  'CURRENT', 'Santander UK PLC. Ring-fenced entity. Strong capital ratios.', true, 'APPROVED', '2022-06-01 10:00:00', NOW()
);

-- Resolution pack — PayRight (AMBER)
INSERT INTO resolution_pack_health (
  id, firm_id, check_date, overall_status, components, missing_components, created_at
) VALUES (
  'd1000009-0009-4009-a009-000000000001',
  '00000009-0009-4009-a009-000000000009',
  CURRENT_DATE,
  'AMBER',
  '{
    "safeguarding_policy": "GREEN",
    "reconciliation_procedure": "GREEN",
    "breach_procedure": "GREEN",
    "wind_down_plan": "GREEN",
    "acknowledgement_letters": "RED",
    "third_party_dd": "GREEN",
    "responsibility_assignments": "GREEN",
    "client_contracts": "GREEN"
  }',
  '["acknowledgement_letters: SA-PR-DBK-EUR-01 Deutsche Bank AG EUR letter missing"]',
  NOW()
);

-- =============================================================================
-- QUICKSEND LTD — GREEN (no breaches)
-- =============================================================================

-- DD records for QuickSend (both CURRENT)
INSERT INTO third_party_due_diligence (
  id, firm_id, safeguarding_account_id, bank_name,
  initial_dd_date, last_review_date, next_review_due,
  review_status, creditworthiness_assessment, diversification_considered,
  dd_outcome, created_at, updated_at
) VALUES
(
  'dd000010-0010-4010-a010-000000000001',
  '00000010-0010-4010-a010-000000000010',
  (SELECT id FROM safeguarding_accounts WHERE firm_id = '00000010-0010-4010-a010-000000000010' AND external_account_id = 'SA-QS-MON-GBP-01'),
  'Monzo Business Bank', '2023-11-15', '2025-11-10', '2026-11-10',
  'CURRENT', 'Monzo Business Bank (FCA authorised e-money institution). Satisfactory capital.',
  true, 'APPROVED', '2023-11-15 10:00:00', NOW()
),
(
  'dd000010-0010-4010-a010-000000000002',
  '00000010-0010-4010-a010-000000000010',
  (SELECT id FROM safeguarding_accounts WHERE firm_id = '00000010-0010-4010-a010-000000000010' AND external_account_id = 'SA-QS-STL-GBP-01'),
  'Starling Bank', '2023-11-15', '2025-11-10', '2026-11-10',
  'CURRENT', 'Starling Bank (FCA authorised e-money institution). Strong capital adequacy.',
  true, 'APPROVED', '2023-11-15 10:00:00', NOW()
);

-- Resolution pack — QuickSend (GREEN)
INSERT INTO resolution_pack_health (
  id, firm_id, check_date, overall_status, components, missing_components, created_at
) VALUES (
  'd1000010-0010-4010-a010-000000000001',
  '00000010-0010-4010-a010-000000000010',
  CURRENT_DATE,
  'GREEN',
  '{
    "safeguarding_policy": "GREEN",
    "reconciliation_procedure": "GREEN",
    "breach_procedure": "GREEN",
    "wind_down_plan": "GREEN",
    "acknowledgement_letters": "GREEN",
    "third_party_dd": "GREEN",
    "responsibility_assignments": "GREEN",
    "client_contracts": "GREEN"
  }',
  NULL,
  NOW()
);
