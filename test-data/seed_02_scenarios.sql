-- =============================================================================
-- SEED 02: Scenario Data — Missing Ack Letter, Overdue DD, Pre-seeded Breaches
-- Run this AFTER all CSVs have been uploaded and processed successfully.
-- Assumes seed_01_firms_users.sql has already been executed.
-- =============================================================================

-- Helper: firm UUIDs defined in seed_01
-- PayFlow Ltd:     '00000001-0001-4001-a001-000000000001'
-- TransferQuick:   '00000002-0002-4002-a002-000000000002'
-- PayFlow CO user: 'u1000001-0001-4001-a001-000000000001'
-- TQ CO user:      'u2000001-0002-4002-a002-000000000001'

-- =============================================================================
-- SCENARIO 3: MISSING ACKNOWLEDGEMENT LETTER
-- PayFlow Ltd — Lloyds Bank EUR account (SA-PF-LBG-EUR-01)
-- This account has never received a bank acknowledgement letter.
-- =============================================================================

-- Mark the Lloyds EUR safeguarding account as letter_status = MISSING
UPDATE safeguarding_accounts
SET    letter_status = 'MISSING'
WHERE  firm_id = '00000001-0001-4001-a001-000000000001'
  AND  external_account_id = 'SA-PF-LBG-EUR-01';

-- Insert a LETTER_MISSING breach (DETECTED state)
INSERT INTO breaches (
  id,
  firm_id,
  breach_type,
  severity,
  is_notifiable,
  material_discrepancy_exceeded,
  currency,
  shortfall_amount,
  shortfall_percentage,
  description,
  status,
  version,
  created_at
) VALUES (
  'b0000001-0001-4001-a001-000000000001',
  '00000001-0001-4001-a001-000000000001',
  'LETTER_MISSING',
  'HIGH',
  false,
  false,
  'EUR',
  NULL,
  NULL,
  'No acknowledgement letter on file for Lloyds Bank PLC EUR safeguarding account '
  'SA-PF-LBG-EUR-01 (****2292). Under PS25 regulation 10(3) and the firm''s '
  'safeguarding policy, a signed bank acknowledgement confirming safeguarding '
  'designation must be held and renewed annually. This account has been active since '
  '2023-02-28 with no letter uploaded. Immediate action required to obtain and upload '
  'a signed letter from Lloyds Bank PLC.',
  'DETECTED',
  1,
  NOW() - INTERVAL '3 days'
);

-- =============================================================================
-- SCENARIO 4: OVERDUE DUE DILIGENCE REVIEW
-- TransferQuick Ltd — Monzo Business Bank (SA-TQ-MON-GBP-01)
-- Annual DD review was due 2025-09-30 and has not been completed.
-- =============================================================================

-- Insert the ThirdPartyDueDiligence record for Monzo (initial DD done, now overdue)
INSERT INTO third_party_due_diligence (
  id,
  firm_id,
  safeguarding_account_id,
  bank_name,
  initial_dd_date,
  last_review_date,
  next_review_due,
  review_status,
  creditworthiness_assessment,
  diversification_considered,
  dd_outcome,
  created_at,
  updated_at
) VALUES (
  'dd000001-0002-4002-a002-000000000001',
  '00000002-0002-4002-a002-000000000002',
  (SELECT id FROM safeguarding_accounts
   WHERE firm_id = '00000002-0002-4002-a002-000000000002'
     AND external_account_id = 'SA-TQ-MON-GBP-01'),
  'Monzo Business Bank',
  '2023-09-15',              -- initial DD performed at account opening
  '2024-09-10',              -- last annual review
  '2025-09-10',              -- next review was due September 2025
  'OVERDUE',
  'Monzo Business Bank (registered with FCA, e-money institution). Capital adequacy '
  'assessed as adequate at last review (Sep 2024). Rated satisfactory. '
  'Note: review now overdue by 5+ months — updated creditworthiness assessment required.',
  true,
  'APPROVED',
  '2023-09-15 10:00:00',
  NOW()
);

-- Insert the ThirdPartyDueDiligence record for Starling (current — for contrast)
INSERT INTO third_party_due_diligence (
  id,
  firm_id,
  safeguarding_account_id,
  bank_name,
  initial_dd_date,
  last_review_date,
  next_review_due,
  review_status,
  creditworthiness_assessment,
  diversification_considered,
  dd_outcome,
  created_at,
  updated_at
) VALUES (
  'dd000002-0002-4002-a002-000000000002',
  '00000002-0002-4002-a002-000000000002',
  (SELECT id FROM safeguarding_accounts
   WHERE firm_id = '00000002-0002-4002-a002-000000000002'
     AND external_account_id = 'SA-TQ-STL-GBP-01'),
  'Starling Bank',
  '2023-09-15',
  '2025-01-20',              -- recent review — CURRENT
  '2026-01-20',
  'CURRENT',
  'Starling Bank (FCA authorised bank). Strong capital position, rated investment grade. '
  'No adverse findings. Diversification noted: Starling provides secondary safeguarding '
  'alongside primary Monzo account.',
  true,
  'APPROVED',
  '2023-09-15 10:00:00',
  NOW()
);

-- Insert a DD_OVERDUE breach for TransferQuick
INSERT INTO breaches (
  id,
  firm_id,
  breach_type,
  severity,
  is_notifiable,
  material_discrepancy_exceeded,
  currency,
  shortfall_amount,
  shortfall_percentage,
  description,
  status,
  version,
  created_at
) VALUES (
  'b0000002-0002-4002-a002-000000000001',
  '00000002-0002-4002-a002-000000000002',
  'DD_OVERDUE',
  'MEDIUM',
  false,
  false,
  NULL,
  NULL,
  NULL,
  'Annual due diligence review for Monzo Business Bank (safeguarding account '
  'SA-TQ-MON-GBP-01) is overdue. Last review completed 2024-09-10; next review '
  'was due by 2025-09-10. Review is now 5+ months overdue. Under PS25 regulation '
  'and the firm''s safeguarding policy, safeguarding institutions must be subject '
  'to annual creditworthiness assessment. £1,800,000 GBP of client funds held at '
  'this institution. Assign a responsible officer to complete the DD review and '
  'upload evidence of the creditworthiness assessment.',
  'DETECTED',
  1,
  NOW() - INTERVAL '7 days'
);

-- =============================================================================
-- SCENARIO 5: MATERIAL DISCREPANCY — pre-seeded to accompany CSV data
-- PayFlow Ltd — HSBC Bank USD account (SA-PF-HSBC-USD-01)
-- Ledger: $3,200,000 | Bank statement: $2,930,000 | Variance: $270,000 (8.44%)
-- This breach will also be detected automatically when reconciliation runs,
-- but is pre-seeded here to ensure it appears in testing without running recon.
-- =============================================================================

INSERT INTO breaches (
  id,
  firm_id,
  breach_type,
  severity,
  is_notifiable,
  material_discrepancy_exceeded,
  currency,
  shortfall_amount,
  shortfall_percentage,
  description,
  status,
  version,
  created_at
) VALUES (
  'b0000003-0001-4001-a001-000000000003',
  '00000001-0001-4001-a001-000000000001',
  'EXTERNAL_BREAK',
  'HIGH',
  true,
  true,
  'USD',
  270000.00,
  8.4375,
  'Material discrepancy detected on HSBC Bank PLC USD safeguarding account '
  'SA-PF-HSBC-USD-01 (****7653) as at 2026-02-24. Safeguarding ledger balance: '
  '$3,200,000.00 USD. Bank statement closing balance: $2,930,000.00 USD. '
  'Variance: $270,000.00 (8.44%). This exceeds the firm''s material discrepancy '
  'threshold of 1.50% / $50,000. Possible causes: unreconciled bank charges, '
  'delayed SWIFT settlement, or posting error. Compliance Officer must acknowledge '
  'within 24 hours and initiate investigation. FCA notification may be required if '
  'not resolved within the escalation window.',
  'DETECTED',
  1,
  NOW() - INTERVAL '1 day'
);

-- =============================================================================
-- RECONCILIATION RESPONSIBILITY ASSIGNMENTS — both firms
-- =============================================================================

INSERT INTO responsibility_assignments (
  id, firm_id, role_type, person_name, job_title, smf_function,
  effective_from, approved_by, approval_date, created_at, updated_at
) VALUES
(
  'da000001-0001-4001-a001-000000000001',
  '00000001-0001-4001-a001-000000000001',
  'SAFEGUARDING_OWNER',
  'Sarah Compliance',
  'Chief Compliance Officer',
  'SMF16',
  '2022-01-15',
  'Board of Directors',
  '2022-01-10',
  NOW(),
  NOW()
),
(
  'da000001-0001-4001-a001-000000000002',
  '00000001-0001-4001-a001-000000000001',
  'MLRO',
  'David Risk',
  'Money Laundering Reporting Officer',
  'SMF17',
  '2022-01-15',
  'Board of Directors',
  '2022-01-10',
  NOW(),
  NOW()
),
(
  'da000002-0002-4002-a002-000000000001',
  '00000002-0002-4002-a002-000000000002',
  'SAFEGUARDING_OWNER',
  'Michael Compliance',
  'Head of Compliance',
  'SMF16',
  '2023-06-01',
  'Board of Directors',
  '2023-05-25',
  NOW(),
  NOW()
);

-- =============================================================================
-- RESOLUTION PACK HEALTH CHECKS (initial baseline)
-- =============================================================================

INSERT INTO resolution_pack_health (
  id, firm_id, check_date, overall_status, components, missing_components, created_at
) VALUES
(
  'd1000001-0001-4001-a001-000000000001',
  '00000001-0001-4001-a001-000000000001',
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
  '["acknowledgement_letters: SA-PF-LBG-EUR-01 letter missing"]',
  NOW()
),
(
  'd1000002-0002-4002-a002-000000000001',
  '00000002-0002-4002-a002-000000000002',
  CURRENT_DATE,
  'AMBER',
  '{
    "safeguarding_policy": "GREEN",
    "reconciliation_procedure": "GREEN",
    "breach_procedure": "GREEN",
    "wind_down_plan": "GREEN",
    "acknowledgement_letters": "GREEN",
    "third_party_dd": "AMBER",
    "responsibility_assignments": "GREEN",
    "client_contracts": "GREEN"
  }',
  '["third_party_dd: Monzo Business Bank review overdue"]',
  NOW()
);
