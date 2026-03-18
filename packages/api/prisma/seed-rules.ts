import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface RuleSeed {
  ruleCode: string;
  framework: string;
  ruleName: string;
  ruleDescription: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  sourceRegulation: string;
  sourceArticle: string;
}

const rules: RuleSeed[] = [
  // ─── PS25 (FCA Payment Services — EMI and PI) ─────────────────────────────
  { ruleCode: 'PS25-001', framework: 'PS25', ruleName: 'Relevant funds calculation method', ruleDescription: 'Average outstanding e-money method for EMIs; end-of-day for PIs', severity: 'HIGH', sourceRegulation: 'FCA PS25 — Payment Services', sourceArticle: 'EMD Reg 20, PSR 23' },
  { ruleCode: 'PS25-002', framework: 'PS25', ruleName: 'Approved safeguarding method', ruleDescription: 'Safeguarding method must be statutory trust, insurance, or guarantee', severity: 'CRITICAL', sourceRegulation: 'FCA PS25 — Payment Services', sourceArticle: 'EMD Reg 21, PSR 23(1)' },
  { ruleCode: 'PS25-003', framework: 'PS25', ruleName: 'Approved credit institution for segregation', ruleDescription: 'If segregation method: account must be at approved credit institution', severity: 'CRITICAL', sourceRegulation: 'FCA PS25 — Payment Services', sourceArticle: 'PSR 23(7)' },
  { ruleCode: 'PS25-004', framework: 'PS25', ruleName: 'Acknowledgement letter', ruleDescription: 'Letter must exist, be current, and reference the correct account', severity: 'HIGH', sourceRegulation: 'FCA PS25 — Payment Services', sourceArticle: 'PSR 23(9)' },
  { ruleCode: 'PS25-005', framework: 'PS25', ruleName: 'Wind-down buffer', ruleDescription: 'Wind-down plan must be maintained above regulatory minimum', severity: 'HIGH', sourceRegulation: 'FCA PS25 — Payment Services', sourceArticle: 'FCA Approach Document Ch 10' },
  { ruleCode: 'PS25-006', framework: 'PS25', ruleName: 'Daily reconciliation', ruleDescription: 'Reconciliation must be performed each business day', severity: 'CRITICAL', sourceRegulation: 'FCA PS25 — Payment Services', sourceArticle: 'PSR 23(12)' },
  { ruleCode: 'PS25-007', framework: 'PS25', ruleName: 'Shortfall top-up', ruleDescription: 'Any shortfall must be topped up by end of next business day', severity: 'CRITICAL', sourceRegulation: 'FCA PS25 — Payment Services', sourceArticle: 'PSR 23(13)' },
  { ruleCode: 'PS25-008', framework: 'PS25', ruleName: 'Safeguarding return submission', ruleDescription: 'Return must be submitted to FCA within required timeframe', severity: 'HIGH', sourceRegulation: 'FCA PS25 — Payment Services', sourceArticle: 'SUP 16.12' },
  { ruleCode: 'PS25-009', framework: 'PS25', ruleName: 'Breach notification to FCA', ruleDescription: 'Breach notification required within prescribed period for material shortfall', severity: 'CRITICAL', sourceRegulation: 'FCA PS25 — Payment Services', sourceArticle: 'SUP 15.3' },
  { ruleCode: 'PS25-010', framework: 'PS25', ruleName: 'Coverage ratio 100%', ruleDescription: 'Coverage ratio must be 100% minimum at all times', severity: 'CRITICAL', sourceRegulation: 'FCA PS25 — Payment Services', sourceArticle: 'PSR 23(6)' },

  // ─── PSD2/EMR (EU Payment Services) ───────────────────────────────────────
  { ruleCode: 'PSD2-001', framework: 'PSD2', ruleName: 'EU EMR safeguarding obligations', ruleDescription: 'Equivalent safeguarding obligations under EU EMR framework', severity: 'HIGH', sourceRegulation: 'PSD2 / EMR', sourceArticle: 'PSD2 Art 10, EMD2 Art 7' },
  { ruleCode: 'PSD2-002', framework: 'PSD2', ruleName: 'Daily average method (EBA)', ruleDescription: 'Relevant funds calculation per EBA guidelines using daily average method', severity: 'HIGH', sourceRegulation: 'PSD2 / EMR', sourceArticle: 'EBA GL/2017/09' },
  { ruleCode: 'PSD2-003', framework: 'PSD2', ruleName: 'Jurisdiction-specific method approval', ruleDescription: 'Approved safeguarding methods vary by jurisdiction of authorisation', severity: 'HIGH', sourceRegulation: 'PSD2 / EMR', sourceArticle: 'PSD2 Art 10(1)' },
  { ruleCode: 'PSD2-004', framework: 'PSD2', ruleName: 'NCA notification requirements', ruleDescription: 'National competent authority notification requirements differ by member state', severity: 'MEDIUM', sourceRegulation: 'PSD2 / EMR', sourceArticle: 'PSD2 Art 7' },
  { ruleCode: 'PSD2-005', framework: 'PSD2', ruleName: 'Cross-border safeguarding', ruleDescription: 'Funds held in another EU member state must meet home state requirements', severity: 'HIGH', sourceRegulation: 'PSD2 / EMR', sourceArticle: 'PSD2 Art 10(2)' },
  { ruleCode: 'PSD2-006', framework: 'PSD2', ruleName: 'EBA RTS compliance', ruleDescription: 'EBA regulatory technical standards on safeguarding must be applied', severity: 'MEDIUM', sourceRegulation: 'PSD2 / EMR', sourceArticle: 'EBA RTS 2017/09' },

  // ─── CASS 5 (Client Money — intermediaries) ──────────────────────────────
  { ruleCode: 'CASS5-001', framework: 'CASS5', ruleName: 'Designated client bank account', ruleDescription: 'Client money must be segregated in designated client bank account', severity: 'CRITICAL', sourceRegulation: 'FCA CASS 5', sourceArticle: 'CASS 5.5.1R' },
  { ruleCode: 'CASS5-002', framework: 'CASS5', ruleName: 'Bank acknowledgement', ruleDescription: 'Account must be acknowledged by bank as client money account', severity: 'CRITICAL', sourceRegulation: 'FCA CASS 5', sourceArticle: 'CASS 5.5.40R' },
  { ruleCode: 'CASS5-003', framework: 'CASS5', ruleName: 'Daily reconciliation', ruleDescription: 'Internal reconciliation required each business day', severity: 'CRITICAL', sourceRegulation: 'FCA CASS 5', sourceArticle: 'CASS 5.5.63R' },
  { ruleCode: 'CASS5-004', framework: 'CASS5', ruleName: 'Same-day discrepancy resolution', ruleDescription: 'Any discrepancy must be paid into client account by close of business', severity: 'CRITICAL', sourceRegulation: 'FCA CASS 5', sourceArticle: 'CASS 5.5.67R' },
  { ruleCode: 'CASS5-005', framework: 'CASS5', ruleName: 'Resolution pack', ruleDescription: 'CASS 5 resolution pack must exist and be current', severity: 'HIGH', sourceRegulation: 'FCA CASS 5', sourceArticle: 'CASS 10.1' },
  { ruleCode: 'CASS5-006', framework: 'CASS5', ruleName: 'Shortfall treatment', ruleDescription: 'Firm must make good any shortfall immediately', severity: 'CRITICAL', sourceRegulation: 'FCA CASS 5', sourceArticle: 'CASS 5.5.68R' },
  { ruleCode: 'CASS5-007', framework: 'CASS5', ruleName: 'Prudent segregation', ruleDescription: 'Firm may hold excess — must be documented', severity: 'LOW', sourceRegulation: 'FCA CASS 5', sourceArticle: 'CASS 5.5.69G' },

  // ─── CASS 6 (Prime brokerage and stock lending) ──────────────────────────
  { ruleCode: 'CASS6-001', framework: 'CASS6', ruleName: 'Rehypothecation limits', ruleDescription: 'Cannot rehypothecate more than 100% of client net debit balance', severity: 'CRITICAL', sourceRegulation: 'FCA CASS 6', sourceArticle: 'CASS 6.1.4R' },
  { ruleCode: 'CASS6-002', framework: 'CASS6', ruleName: 'Collateral segregation', ruleDescription: 'Collateral received must be appropriately segregated', severity: 'HIGH', sourceRegulation: 'FCA CASS 6', sourceArticle: 'CASS 6.1.7R' },
  { ruleCode: 'CASS6-003', framework: 'CASS6', ruleName: 'Stock lending documentation', ruleDescription: 'Stock lending agreements must be documented and current', severity: 'HIGH', sourceRegulation: 'FCA CASS 6', sourceArticle: 'CASS 6.1.10R' },
  { ruleCode: 'CASS6-004', framework: 'CASS6', ruleName: 'Daily securities reconciliation', ruleDescription: 'Daily reconciliation of lent securities against collateral held', severity: 'CRITICAL', sourceRegulation: 'FCA CASS 6', sourceArticle: 'CASS 6.1.16R' },
  { ruleCode: 'CASS6-005', framework: 'CASS6', ruleName: 'Client consent documentation', ruleDescription: 'Client consent for rehypothecation must be documented', severity: 'HIGH', sourceRegulation: 'FCA CASS 6', sourceArticle: 'CASS 6.1.3R' },
  { ruleCode: 'CASS6-006', framework: 'CASS6', ruleName: 'Collateral concentration limits', ruleDescription: 'Concentration limits on collateral types must be monitored', severity: 'MEDIUM', sourceRegulation: 'FCA CASS 6', sourceArticle: 'CASS 6.1.9G' },

  // ─── CASS 7 (Client Assets — custody) ─────────────────────────────────────
  { ruleCode: 'CASS7-001', framework: 'CASS7', ruleName: 'Daily internal reconciliation', ruleDescription: 'Internal reconciliation of client assets must be performed daily', severity: 'CRITICAL', sourceRegulation: 'FCA CASS 7', sourceArticle: 'CASS 7.15.3R' },
  { ruleCode: 'CASS7-002', framework: 'CASS7', ruleName: 'Monthly external reconciliation', ruleDescription: 'External reconciliation within 10 business days of month end', severity: 'HIGH', sourceRegulation: 'FCA CASS 7', sourceArticle: 'CASS 7.15.5R' },
  { ruleCode: 'CASS7-003', framework: 'CASS7', ruleName: 'CMAR submission', ruleDescription: 'CMAR within 25 business days of period end — validate completeness', severity: 'HIGH', sourceRegulation: 'FCA CASS 7', sourceArticle: 'SUP 16.12.29AR' },
  { ruleCode: 'CASS7-004', framework: 'CASS7', ruleName: 'Custody account designation', ruleDescription: 'Custody accounts must be appropriately designated', severity: 'CRITICAL', sourceRegulation: 'FCA CASS 7', sourceArticle: 'CASS 7.13.3R' },
  { ruleCode: 'CASS7-005', framework: 'CASS7', ruleName: 'Stock lending controls', ruleDescription: 'Stock lending controls must be verified if applicable', severity: 'HIGH', sourceRegulation: 'FCA CASS 7', sourceArticle: 'CASS 7.11' },
  { ruleCode: 'CASS7-006', framework: 'CASS7', ruleName: 'Resolution pack current', ruleDescription: 'CASS 7 resolution pack must exist and be current', severity: 'HIGH', sourceRegulation: 'FCA CASS 7', sourceArticle: 'CASS 10.1' },
  { ruleCode: 'CASS7-007', framework: 'CASS7', ruleName: 'Asset identification and segregation', ruleDescription: 'Safe custody assets must be identifiable and segregated', severity: 'CRITICAL', sourceRegulation: 'FCA CASS 7', sourceArticle: 'CASS 7.13.8R' },
  { ruleCode: 'CASS7-008', framework: 'CASS7', ruleName: 'CASS 7A applicability', ruleDescription: 'Check CASS 7A applicability for certain investment firms', severity: 'MEDIUM', sourceRegulation: 'FCA CASS 7A', sourceArticle: 'CASS 7A.1.1R' },

  // ─── CASS 10 (Resolution Pack) ────────────────────────────────────────────
  { ruleCode: 'CASS10-001', framework: 'CASS10', ruleName: 'Required documents', ruleDescription: 'Resolution pack must contain all required documents', severity: 'HIGH', sourceRegulation: 'FCA CASS 10', sourceArticle: 'CASS 10.1.8R' },
  { ruleCode: 'CASS10-002', framework: 'CASS10', ruleName: 'Material change update', ruleDescription: 'Must be updated within 10 business days of any material change', severity: 'HIGH', sourceRegulation: 'FCA CASS 10', sourceArticle: 'CASS 10.1.12R' },
  { ruleCode: 'CASS10-003', framework: 'CASS10', ruleName: 'Retrievable format', ruleDescription: 'Must be stored in a retrievable format', severity: 'MEDIUM', sourceRegulation: 'FCA CASS 10', sourceArticle: 'CASS 10.1.10R' },
  { ruleCode: 'CASS10-004', framework: 'CASS10', ruleName: 'Annual review and sign-off', ruleDescription: 'Annual review and sign-off by senior manager required', severity: 'HIGH', sourceRegulation: 'FCA CASS 10', sourceArticle: 'CASS 10.1.14R' },
  { ruleCode: 'CASS10-005', framework: 'CASS10', ruleName: 'Insolvency practitioner access', ruleDescription: 'Must be accessible to insolvency practitioner within 48 hours', severity: 'HIGH', sourceRegulation: 'FCA CASS 10', sourceArticle: 'CASS 10.1.11R' },

  // ─── MiCA (Markets in Crypto Assets) ──────────────────────────────────────
  { ruleCode: 'MICA-001', framework: 'MICA', ruleName: 'Reserve asset segregation', ruleDescription: 'Reserve assets must be fully segregated from firm assets', severity: 'CRITICAL', sourceRegulation: 'MiCA Regulation (EU) 2023/1114', sourceArticle: 'Art 36(4)' },
  { ruleCode: 'MICA-002', framework: 'MICA', ruleName: '30% deposit requirement', ruleDescription: 'Minimum 30% must be held in credit institutions as deposits', severity: 'HIGH', sourceRegulation: 'MiCA Regulation (EU) 2023/1114', sourceArticle: 'Art 36(4)(b)' },
  { ruleCode: 'MICA-003', framework: 'MICA', ruleName: '10% concentration limit', ruleDescription: 'No single credit institution can hold more than 10% of reserve assets', severity: 'HIGH', sourceRegulation: 'MiCA Regulation (EU) 2023/1114', sourceArticle: 'Art 36(5)' },
  { ruleCode: 'MICA-004', framework: 'MICA', ruleName: 'Reserve ratio 100%', ruleDescription: 'Reserve ratio must be maintained at 100% minimum at all times', severity: 'CRITICAL', sourceRegulation: 'MiCA Regulation (EU) 2023/1114', sourceArticle: 'Art 36(1)' },
  { ruleCode: 'MICA-005', framework: 'MICA', ruleName: 'Daily token-reserve reconciliation', ruleDescription: 'Daily reconciliation of tokens in circulation against reserve assets', severity: 'CRITICAL', sourceRegulation: 'MiCA Regulation (EU) 2023/1114', sourceArticle: 'Art 36(7)' },
  { ruleCode: 'MICA-006', framework: 'MICA', ruleName: 'Monthly attestation', ruleDescription: 'Independent attestation required at least monthly for significant EMTs', severity: 'HIGH', sourceRegulation: 'MiCA Regulation (EU) 2023/1114', sourceArticle: 'Art 36(9)' },
  { ruleCode: 'MICA-007', framework: 'MICA', ruleName: 'On-chain wallet reconciliation', ruleDescription: 'On-chain wallet balances must reconcile against reserve ledger', severity: 'HIGH', sourceRegulation: 'MiCA Regulation (EU) 2023/1114', sourceArticle: 'Art 36(7)' },
  { ruleCode: 'MICA-008', framework: 'MICA', ruleName: 'Peg stability', ruleDescription: 'Token must maintain value within defined tolerance', severity: 'CRITICAL', sourceRegulation: 'MiCA Regulation (EU) 2023/1114', sourceArticle: 'Art 36(2)' },
  { ruleCode: 'MICA-009', framework: 'MICA', ruleName: 'Whitepaper alignment', ruleDescription: 'Whitepaper disclosures must align with actual reserve composition', severity: 'MEDIUM', sourceRegulation: 'MiCA Regulation (EU) 2023/1114', sourceArticle: 'Art 19' },
  { ruleCode: 'MICA-010', framework: 'MICA', ruleName: 'Wind-down plan', ruleDescription: 'Wind-down plan must be in place', severity: 'HIGH', sourceRegulation: 'MiCA Regulation (EU) 2023/1114', sourceArticle: 'Art 42' },
  { ruleCode: 'MICA-011', framework: 'MICA', ruleName: 'Significant token threshold', ruleDescription: 'Above €5B outstanding: enhanced Article 58 requirements apply', severity: 'HIGH', sourceRegulation: 'MiCA Regulation (EU) 2023/1114', sourceArticle: 'Art 58' },
  { ruleCode: 'MICA-012', framework: 'MICA', ruleName: 'Cross-framework MiFID check', ruleDescription: 'If also MiFID authorised, check for MiCA/CASS conflicts', severity: 'MEDIUM', sourceRegulation: 'MiCA Regulation (EU) 2023/1114', sourceArticle: 'Art 60' },

  // ─── GENIUS Act (US Stablecoin) ───────────────────────────────────────────
  { ruleCode: 'GENIUS-001', framework: 'GENIUS', ruleName: 'Permitted reserves only', ruleDescription: 'Only US coins/currency, Fed deposits, short-term T-bills (93d max), repo, FDIC deposits', severity: 'CRITICAL', sourceRegulation: 'GENIUS Act (2025)', sourceArticle: 'Sec 4(a)' },
  { ruleCode: 'GENIUS-002', framework: 'GENIUS', ruleName: '1:1 reserve ratio', ruleDescription: 'Reserve ratio must be 1:1 minimum at all times', severity: 'CRITICAL', sourceRegulation: 'GENIUS Act (2025)', sourceArticle: 'Sec 4(b)' },
  { ruleCode: 'GENIUS-003', framework: 'GENIUS', ruleName: 'Monthly attestation', ruleDescription: 'Monthly attestation by registered public accounting firm required', severity: 'HIGH', sourceRegulation: 'GENIUS Act (2025)', sourceArticle: 'Sec 4(c)' },
  { ruleCode: 'GENIUS-004', framework: 'GENIUS', ruleName: 'Redemption at par', ruleDescription: 'Must be able to redeem 1:1 within prescribed timeframe', severity: 'CRITICAL', sourceRegulation: 'GENIUS Act (2025)', sourceArticle: 'Sec 5(a)' },
  { ruleCode: 'GENIUS-005', framework: 'GENIUS', ruleName: 'Bankruptcy remote segregation', ruleDescription: 'Reserve assets must be bankruptcy remote', severity: 'CRITICAL', sourceRegulation: 'GENIUS Act (2025)', sourceArticle: 'Sec 4(d)' },
  { ruleCode: 'GENIUS-006', framework: 'GENIUS', ruleName: 'No rehypothecation', ruleDescription: 'No rehypothecation of reserve assets permitted', severity: 'CRITICAL', sourceRegulation: 'GENIUS Act (2025)', sourceArticle: 'Sec 4(e)' },
  { ruleCode: 'GENIUS-007', framework: 'GENIUS', ruleName: 'Monthly public disclosure', ruleDescription: 'Monthly public disclosure of reserve composition required', severity: 'HIGH', sourceRegulation: 'GENIUS Act (2025)', sourceArticle: 'Sec 6(a)' },
  { ruleCode: 'GENIUS-008', framework: 'GENIUS', ruleName: 'Annual audit ($50B+ threshold)', ruleDescription: 'Annual audit for issuers above $50B threshold', severity: 'HIGH', sourceRegulation: 'GENIUS Act (2025)', sourceArticle: 'Sec 6(b)' },
  { ruleCode: 'GENIUS-009', framework: 'GENIUS', ruleName: 'State-level compliance', ruleDescription: 'State-specific requirements (NY BitLicense, CA DFPI, TX) and federal preemption check', severity: 'MEDIUM', sourceRegulation: 'GENIUS Act (2025)', sourceArticle: 'Sec 8' },

  // ─── SRA (Solicitors Regulation Authority) ────────────────────────────────
  { ruleCode: 'SRA-001', framework: 'SRA', ruleName: 'Approved bank account', ruleDescription: 'Client account must be at approved bank or building society', severity: 'CRITICAL', sourceRegulation: 'SRA Accounts Rules 2019', sourceArticle: 'Rule 2.1' },
  { ruleCode: 'SRA-002', framework: 'SRA', ruleName: 'Monthly reconciliation', ruleDescription: 'Monthly reconciliation mandatory — no exceptions', severity: 'CRITICAL', sourceRegulation: 'SRA Accounts Rules 2019', sourceArticle: 'Rule 8.3' },
  { ruleCode: 'SRA-003', framework: 'SRA', ruleName: 'COFA sign-off', ruleDescription: 'Reconciliation must be signed off by COFA', severity: 'HIGH', sourceRegulation: 'SRA Accounts Rules 2019', sourceArticle: 'Rule 8.4' },
  { ruleCode: 'SRA-004', framework: 'SRA', ruleName: 'Residual balance treatment', ruleDescription: 'Residual client balances must be identified and dealt with promptly', severity: 'MEDIUM', sourceRegulation: 'SRA Accounts Rules 2019', sourceArticle: 'Rule 2.5' },
  { ruleCode: 'SRA-005', framework: 'SRA', ruleName: 'Interest accounting', ruleDescription: 'Interest must be accounted for correctly per SRA interest policy', severity: 'MEDIUM', sourceRegulation: 'SRA Accounts Rules 2019', sourceArticle: 'Rule 7' },
  { ruleCode: 'SRA-006', framework: 'SRA', ruleName: 'No deficit', ruleDescription: 'Client account must not go into deficit', severity: 'CRITICAL', sourceRegulation: 'SRA Accounts Rules 2019', sourceArticle: 'Rule 3.3' },
  { ruleCode: 'SRA-007', framework: 'SRA', ruleName: 'Prohibited transactions', ruleDescription: 'No payments from client account that would cause deficit', severity: 'CRITICAL', sourceRegulation: 'SRA Accounts Rules 2019', sourceArticle: 'Rule 3.3' },
  { ruleCode: 'SRA-008', framework: 'SRA', ruleName: 'Annual accountant report', ruleDescription: 'Annual accountant\'s report required — verify submission date', severity: 'HIGH', sourceRegulation: 'SRA Accounts Rules 2019', sourceArticle: 'Rule 12' },
  { ruleCode: 'SRA-009', framework: 'SRA', ruleName: 'Matter ledger reconciliation', ruleDescription: 'Matter ledger must reconcile to client account balance', severity: 'HIGH', sourceRegulation: 'SRA Accounts Rules 2019', sourceArticle: 'Rule 8.1' },
  { ruleCode: 'SRA-010', framework: 'SRA', ruleName: 'Designated client accounts', ruleDescription: 'Separate accounts for large or long-term matters', severity: 'MEDIUM', sourceRegulation: 'SRA Accounts Rules 2019', sourceArticle: 'Rule 2.1(b)' },
  { ruleCode: 'SRA-011', framework: 'SRA', ruleName: 'TPMA rules', ruleDescription: 'Additional rules for third party managed accounts', severity: 'MEDIUM', sourceRegulation: 'SRA Accounts Rules 2019', sourceArticle: 'Rule 11' },

  // ─── Gambling Commission ──────────────────────────────────────────────────
  { ruleCode: 'GC-001', framework: 'GC', ruleName: 'Protection level declaration', ruleDescription: 'Protection level must be declared: BASIC, MEDIUM, or HIGH', severity: 'HIGH', sourceRegulation: 'Gambling Commission LCCP', sourceArticle: 'SR Code 4.2.1' },
  { ruleCode: 'GC-002', framework: 'GC', ruleName: 'MEDIUM level insurance/guarantee', ruleDescription: 'Insurance or guarantee covering full player fund balance required for MEDIUM level', severity: 'HIGH', sourceRegulation: 'Gambling Commission LCCP', sourceArticle: 'SR Code 4.2.2' },
  { ruleCode: 'GC-003', framework: 'GC', ruleName: 'HIGH level independent trust', ruleDescription: 'Independent trust with FCA-authorised trustee required for HIGH level', severity: 'CRITICAL', sourceRegulation: 'Gambling Commission LCCP', sourceArticle: 'SR Code 4.2.3' },
  { ruleCode: 'GC-004', framework: 'GC', ruleName: 'Daily balance reconciliation', ruleDescription: 'Player fund balance must reconcile to protected account daily', severity: 'CRITICAL', sourceRegulation: 'Gambling Commission LCCP', sourceArticle: 'SR Code 4.2.4' },
  { ruleCode: 'GC-005', framework: 'GC', ruleName: 'Protection certificate currency', ruleDescription: 'Protection level certificate must be current', severity: 'HIGH', sourceRegulation: 'Gambling Commission LCCP', sourceArticle: 'SR Code 4.2.1' },
  { ruleCode: 'GC-006', framework: 'GC', ruleName: 'Commission notification', ruleDescription: 'Notify Commission of any change in protection level', severity: 'HIGH', sourceRegulation: 'Gambling Commission LCCP', sourceArticle: 'SR Code 4.2.5' },
  { ruleCode: 'GC-007', framework: 'GC', ruleName: 'Immediate withdrawal availability', ruleDescription: 'Funds must be available for immediate withdrawal — no encumbrances', severity: 'CRITICAL', sourceRegulation: 'Gambling Commission LCCP', sourceArticle: 'SR Code 4.2.6' },
  { ruleCode: 'GC-008', framework: 'GC', ruleName: 'Annual submission', ruleDescription: 'Annual submission of player fund protection status to Commission', severity: 'HIGH', sourceRegulation: 'Gambling Commission LCCP', sourceArticle: 'SR Code 4.2.7' },

  // ─── FCA Insurance ────────────────────────────────────────────────────────
  { ruleCode: 'INS-001', framework: 'INS', ruleName: 'Statutory trust deed', ruleDescription: 'Trust deed must exist and be properly constituted under CASS 5.2', severity: 'CRITICAL', sourceRegulation: 'FCA CASS 5 (Insurance)', sourceArticle: 'CASS 5.2.1R' },
  { ruleCode: 'INS-002', framework: 'INS', ruleName: 'Non-statutory trust requirements', ruleDescription: 'Must meet enhanced requirements under CASS 5.2.3', severity: 'HIGH', sourceRegulation: 'FCA CASS 5 (Insurance)', sourceArticle: 'CASS 5.2.3R' },
  { ruleCode: 'INS-003', framework: 'INS', ruleName: 'Premium segregation', ruleDescription: 'Client premiums must be in designated account immediately upon receipt', severity: 'CRITICAL', sourceRegulation: 'FCA CASS 5 (Insurance)', sourceArticle: 'CASS 5.3.1R' },
  { ruleCode: 'INS-004', framework: 'INS', ruleName: 'Statutory trust acknowledgement', ruleDescription: 'Account must be acknowledged as statutory trust by bank', severity: 'CRITICAL', sourceRegulation: 'FCA CASS 5 (Insurance)', sourceArticle: 'CASS 5.5.40R' },
  { ruleCode: 'INS-005', framework: 'INS', ruleName: 'Risk transfer compliance', ruleDescription: 'Premiums must be remitted to insurer within agreed terms', severity: 'HIGH', sourceRegulation: 'FCA CASS 5 (Insurance)', sourceArticle: 'CASS 5.4.1R' },
  { ruleCode: 'INS-006', framework: 'INS', ruleName: 'Reconciliation frequency', ruleDescription: 'Monthly minimum, daily recommended reconciliation', severity: 'HIGH', sourceRegulation: 'FCA CASS 5 (Insurance)', sourceArticle: 'CASS 5.5.63R' },
  { ruleCode: 'INS-007', framework: 'INS', ruleName: 'Renewal date monitoring', ruleDescription: 'CRITICAL at 30d, HIGH at 60d, MEDIUM at 90d before renewal', severity: 'HIGH', sourceRegulation: 'FCA CASS 5 (Insurance)', sourceArticle: 'CASS 5.2.1R' },
  { ruleCode: 'INS-008', framework: 'INS', ruleName: 'Insurer credit rating', ruleDescription: 'Verify insurer holds minimum credit rating', severity: 'MEDIUM', sourceRegulation: 'FCA CASS 5 (Insurance)', sourceArticle: 'CASS 5.2.4G' },
  { ruleCode: 'INS-009', framework: 'INS', ruleName: 'Co-mingling prohibition', ruleDescription: 'Premium accounts must not contain firm money except permitted working capital', severity: 'HIGH', sourceRegulation: 'FCA CASS 5 (Insurance)', sourceArticle: 'CASS 5.5.1R' },

  // ─── Client Deposit Schemes / Real Estate ─────────────────────────────────
  { ruleCode: 'CDS-001', framework: 'CDS', ruleName: 'CMP scheme membership', ruleDescription: 'Membership of approved client money protection scheme required', severity: 'CRITICAL', sourceRegulation: 'CMP / RICS / ARLA / Propertymark', sourceArticle: 'Enterprise Act 2002 / RICS Rules' },
  { ruleCode: 'CDS-002', framework: 'CDS', ruleName: 'Scheme certificate', ruleDescription: 'Certificate must be current, displayed, and cover full balance', severity: 'HIGH', sourceRegulation: 'CMP / Propertymark', sourceArticle: 'Membership Rules' },
  { ruleCode: 'CDS-003', framework: 'CDS', ruleName: 'Designated client money account', ruleDescription: 'Account must be designated and bank-acknowledged', severity: 'CRITICAL', sourceRegulation: 'CMP / RICS', sourceArticle: 'Client Money Rules' },
  { ruleCode: 'CDS-004', framework: 'CDS', ruleName: 'Deposit protection timeliness', ruleDescription: 'Tenancy deposits protected within 30 days in approved scheme', severity: 'CRITICAL', sourceRegulation: 'Housing Act 2004', sourceArticle: 'Section 213(3)' },
  { ruleCode: 'CDS-005', framework: 'CDS', ruleName: 'Annual membership renewal', ruleDescription: 'Track and renew scheme membership — alert at 60 days', severity: 'HIGH', sourceRegulation: 'CMP / Propertymark', sourceArticle: 'Membership Rules' },
  { ruleCode: 'CDS-006', framework: 'CDS', ruleName: 'Deposit reconciliation', ruleDescription: 'Deposit account must reconcile to total deposits held', severity: 'HIGH', sourceRegulation: 'CMP / RICS', sourceArticle: 'Client Money Rules' },
  { ruleCode: 'CDS-007', framework: 'CDS', ruleName: 'Funds segregation', ruleDescription: 'Client money must not be mixed with operating funds', severity: 'CRITICAL', sourceRegulation: 'CMP / RICS', sourceArticle: 'Client Money Rules' },
  { ruleCode: 'CDS-008', framework: 'CDS', ruleName: 'PII requirements', ruleDescription: 'Propertymark/RICS: additional professional indemnity insurance', severity: 'MEDIUM', sourceRegulation: 'RICS / Propertymark', sourceArticle: 'Professional Standards' },

  // ─── DORA (Digital Operational Resilience Act) ────────────────────────────
  { ruleCode: 'DORA-001', framework: 'DORA', ruleName: 'ICT risk management framework', ruleDescription: 'Must be documented and current', severity: 'HIGH', sourceRegulation: 'DORA Regulation (EU) 2022/2554', sourceArticle: 'Art 6' },
  { ruleCode: 'DORA-002', framework: 'DORA', ruleName: 'ICT incident reporting', ruleDescription: 'Major incidents: 4h initial, 72h intermediate, 1m final report', severity: 'CRITICAL', sourceRegulation: 'DORA Regulation (EU) 2022/2554', sourceArticle: 'Art 19' },
  { ruleCode: 'DORA-003', framework: 'DORA', ruleName: 'TLPT testing', ruleDescription: 'Threat-led penetration testing every 3 years for significant entities', severity: 'HIGH', sourceRegulation: 'DORA Regulation (EU) 2022/2554', sourceArticle: 'Art 26' },
  { ruleCode: 'DORA-004', framework: 'DORA', ruleName: 'ICT third-party register', ruleDescription: 'Safeheld must be listed in firm ICT third-party register', severity: 'MEDIUM', sourceRegulation: 'DORA Regulation (EU) 2022/2554', sourceArticle: 'Art 28(3)' },
  { ruleCode: 'DORA-005', framework: 'DORA', ruleName: 'Concentration risk', ruleDescription: 'Single ICT provider dependency for critical functions must be flagged', severity: 'HIGH', sourceRegulation: 'DORA Regulation (EU) 2022/2554', sourceArticle: 'Art 29' },
  { ruleCode: 'DORA-006', framework: 'DORA', ruleName: 'Cyber threat sharing', ruleDescription: 'Participate in cyber threat intelligence sharing arrangements', severity: 'MEDIUM', sourceRegulation: 'DORA Regulation (EU) 2022/2554', sourceArticle: 'Art 45' },
  { ruleCode: 'DORA-007', framework: 'DORA', ruleName: 'Annual ICT review', ruleDescription: 'Annual review of ICT risk management framework', severity: 'HIGH', sourceRegulation: 'DORA Regulation (EU) 2022/2554', sourceArticle: 'Art 6(5)' },
  { ruleCode: 'DORA-008', framework: 'DORA', ruleName: 'Provider contractual obligations', ruleDescription: 'Full contractual obligations with ICT providers documented', severity: 'MEDIUM', sourceRegulation: 'DORA Regulation (EU) 2022/2554', sourceArticle: 'Art 30' },

  // ─── FCA Operational Resilience (PS21/3) ──────────────────────────────────
  { ruleCode: 'PS213-001', framework: 'PS213', ruleName: 'Important business services', ruleDescription: 'Safeguarding is always an important business service', severity: 'HIGH', sourceRegulation: 'FCA PS21/3', sourceArticle: 'SYSC 15A.2' },
  { ruleCode: 'PS213-002', framework: 'PS213', ruleName: 'Impact tolerances', ruleDescription: 'Impact tolerances set for each important business service', severity: 'HIGH', sourceRegulation: 'FCA PS21/3', sourceArticle: 'SYSC 15A.3' },
  { ruleCode: 'PS213-003', framework: 'PS213', ruleName: 'Board-approved self-assessment', ruleDescription: 'Annual self-assessment completed and Board-approved', severity: 'HIGH', sourceRegulation: 'FCA PS21/3', sourceArticle: 'SYSC 15A.4' },
  { ruleCode: 'PS213-004', framework: 'PS213', ruleName: 'Resource mapping', ruleDescription: 'Map resources, systems, and third parties supporting safeguarding', severity: 'MEDIUM', sourceRegulation: 'FCA PS21/3', sourceArticle: 'SYSC 15A.5' },
  { ruleCode: 'PS213-005', framework: 'PS213', ruleName: 'Annual tolerance testing', ruleDescription: 'Test ability to remain within impact tolerances annually', severity: 'HIGH', sourceRegulation: 'FCA PS21/3', sourceArticle: 'SYSC 15A.6' },
  { ruleCode: 'PS213-006', framework: 'PS213', ruleName: 'Full implementation verification', ruleDescription: 'March 2025 deadline passed — verify completed implementation', severity: 'HIGH', sourceRegulation: 'FCA PS21/3', sourceArticle: 'PS21/3 Transitional' },

  // ─── FINRA/SEC Rule 15c3-3 ────────────────────────────────────────────────
  { ruleCode: '15C33-001', framework: '15C33', ruleName: 'Special Reserve Bank Account', ruleDescription: 'SRBA must be maintained at qualifying bank', severity: 'CRITICAL', sourceRegulation: 'SEC Rule 15c3-3', sourceArticle: 'Rule 15c3-3(e)' },
  { ruleCode: '15C33-002', framework: '15C33', ruleName: 'Weekly reserve computation', ruleDescription: 'Weekly computation using standard formula', severity: 'HIGH', sourceRegulation: 'SEC Rule 15c3-3', sourceArticle: 'Rule 15c3-3(e)(3)' },
  { ruleCode: '15C33-003', framework: '15C33', ruleName: 'Excess funds deposit', ruleDescription: 'Deposit excess by close of next business day after computation', severity: 'HIGH', sourceRegulation: 'SEC Rule 15c3-3', sourceArticle: 'Rule 15c3-3(e)(3)' },
  { ruleCode: '15C33-004', framework: '15C33', ruleName: 'Possession and control', ruleDescription: 'Fully paid and excess margin securities in firm control', severity: 'CRITICAL', sourceRegulation: 'SEC Rule 15c3-3', sourceArticle: 'Rule 15c3-3(b)' },
  { ruleCode: '15C33-005', framework: '15C33', ruleName: 'Daily stock record', ruleDescription: 'Stock record must be accurate and current — reconcile daily', severity: 'CRITICAL', sourceRegulation: 'SEC Rule 15c3-3', sourceArticle: 'Rule 17a-13' },
  { ruleCode: '15C33-006', framework: '15C33', ruleName: 'PAB reserve computation', ruleDescription: 'Separate reserve computation for Proprietary Accounts of Brokers', severity: 'HIGH', sourceRegulation: 'SEC Rule 15c3-3', sourceArticle: 'Rule 15c3-3(e)(2)' },
  { ruleCode: '15C33-007', framework: '15C33', ruleName: 'PCAOB annual audit', ruleDescription: 'Annual audit by PCAOB-registered firm', severity: 'HIGH', sourceRegulation: 'SEC Exchange Act', sourceArticle: 'Rule 17a-5' },
  { ruleCode: '15C33-008', framework: '15C33', ruleName: 'FOCUS report filing', ruleDescription: 'Monthly or quarterly FOCUS report depending on firm size', severity: 'HIGH', sourceRegulation: 'SEC Exchange Act', sourceArticle: 'Rule 17a-5(a)' },

  // ─── FCA Consumer Duty (PS22/9) ───────────────────────────────────────────
  { ruleCode: 'CD-001', framework: 'CD', ruleName: 'Consumer Duty programme', ruleDescription: 'Programme must be documented and Board-approved', severity: 'HIGH', sourceRegulation: 'FCA PS22/9 Consumer Duty', sourceArticle: 'PRIN 2A.1' },
  { ruleCode: 'CD-002', framework: 'CD', ruleName: 'Four outcome areas', ruleDescription: 'Products/services, price/value, understanding, support', severity: 'HIGH', sourceRegulation: 'FCA PS22/9 Consumer Duty', sourceArticle: 'PRIN 2A.2-2A.5' },
  { ruleCode: 'CD-003', framework: 'CD', ruleName: 'Annual board report', ruleDescription: 'Annual Consumer Duty board report signed off', severity: 'HIGH', sourceRegulation: 'FCA PS22/9 Consumer Duty', sourceArticle: 'PRIN 2A.1.15R' },
  { ruleCode: 'CD-004', framework: 'CD', ruleName: 'Fair value assessments', ruleDescription: 'Conducted and documented for all products', severity: 'HIGH', sourceRegulation: 'FCA PS22/9 Consumer Duty', sourceArticle: 'PRIN 2A.4' },
  { ruleCode: 'CD-005', framework: 'CD', ruleName: 'Vulnerable customer policy', ruleDescription: 'Must exist and be embedded in operations', severity: 'MEDIUM', sourceRegulation: 'FCA PS22/9 Consumer Duty', sourceArticle: 'FG21/1' },
  { ruleCode: 'CD-006', framework: 'CD', ruleName: 'Monitoring framework', ruleDescription: 'MI reporting to Board on Consumer Duty outcomes', severity: 'MEDIUM', sourceRegulation: 'FCA PS22/9 Consumer Duty', sourceArticle: 'PRIN 2A.1.14R' },
  { ruleCode: 'CD-007', framework: 'CD', ruleName: 'Complaints feedback loop', ruleDescription: 'Root cause analysis feeding into product design', severity: 'MEDIUM', sourceRegulation: 'FCA PS22/9 Consumer Duty', sourceArticle: 'PRIN 2A.2' },
  { ruleCode: 'CD-008', framework: 'CD', ruleName: 'Safeguarding good outcomes', ruleDescription: 'Safeguarding must deliver good outcomes for clients', severity: 'HIGH', sourceRegulation: 'FCA PS22/9 Consumer Duty', sourceArticle: 'PRIN 2A.1' },
];

async function seedRules() {
  console.log('Seeding framework rules...');

  let created = 0;
  let updated = 0;

  for (const rule of rules) {
    const existing = await prisma.frameworkRule.findUnique({ where: { ruleCode: rule.ruleCode } });
    if (existing) {
      await prisma.frameworkRule.update({
        where: { ruleCode: rule.ruleCode },
        data: {
          ...rule,
          version: existing.version + 1,
        },
      });
      updated++;
    } else {
      await prisma.frameworkRule.create({
        data: {
          ...rule,
          effectiveFrom: new Date('2025-01-01'),
        },
      });
      created++;
    }
  }

  // Count per framework
  const frameworks: Record<string, number> = {};
  for (const rule of rules) {
    frameworks[rule.framework] = (frameworks[rule.framework] || 0) + 1;
  }

  console.log(`\nRules seeded: ${created} created, ${updated} updated`);
  console.log(`Total rules: ${rules.length}`);
  console.log('\nRules per framework:');
  for (const [fw, count] of Object.entries(frameworks).sort()) {
    console.log(`  ${fw}: ${count} rules`);
  }

  return { created, updated, total: rules.length, perFramework: frameworks };
}

// Also seed additional demo firms for multi-framework testing
async function seedDemoFirms() {
  console.log('\nSeeding additional demo firms for rules engine testing...');

  const demoFirms = [
    { id: '00000000-0000-0000-0000-000000000022', name: 'Gamma CASS Investment Services', regime: 'CASS7' as const, safeguardingMethod: 'SEGREGATION' as const, fcaFrn: 'FRN345678', cassClassification: 'CASS_LARGE' as const },
    { id: '00000000-0000-0000-0000-000000000023', name: 'Delta MiCA Token Issuer', regime: 'MICA_EMT' as const, safeguardingMethod: 'SEGREGATION' as const, fcaFrn: null },
    { id: '00000000-0000-0000-0000-000000000024', name: 'Epsilon US Stablecoin Corp', regime: 'GENIUS_ACT' as const, safeguardingMethod: 'SEGREGATION' as const, fcaFrn: null },
    { id: '00000000-0000-0000-0000-000000000025', name: 'Zeta Legal LLP', regime: 'SRA_SOLICITOR' as const, safeguardingMethod: 'SEGREGATION' as const, fcaFrn: null },
    { id: '00000000-0000-0000-0000-000000000026', name: 'Eta Insurance Brokers', regime: 'FCA_INSURANCE' as const, safeguardingMethod: 'INSURANCE' as const, fcaFrn: 'FRN567890' },
    { id: '00000000-0000-0000-0000-000000000027', name: 'Theta Gaming plc', regime: 'GAMBLING_COMMISSION' as const, safeguardingMethod: 'SEGREGATION' as const, fcaFrn: null },
  ];

  for (const firm of demoFirms) {
    await prisma.firm.upsert({
      where: { id: firm.id },
      update: {},
      create: {
        ...firm,
        status: 'ACTIVE',
        baseCurrency: 'GBP',
        dateFormat: 'DD_MM_YYYY',
        materialDiscrepancyPct: 1.0,
        materialDiscrepancyAbs: 50000,
      },
    });
    console.log(`  Created/verified: ${firm.name} (${firm.regime})`);
  }

  return demoFirms.length;
}

async function main() {
  const ruleResults = await seedRules();
  const firmCount = await seedDemoFirms();

  console.log(`\n=== SEED COMPLETE ===`);
  console.log(`Rules: ${ruleResults.total} (${ruleResults.created} new, ${ruleResults.updated} updated)`);
  console.log(`Demo firms: ${firmCount} additional firms seeded`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
