import PDFDocument from 'pdfkit';
import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';
import { NotFoundError, ValidationError } from '../../utils/errors';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SectionA {
  firmName: string;
  fcaFrn: string | null;
  reportingMonth: string;
  safeguardingMethod: string;
  reconciliationMethod: string;
  auditExemptionStatus: boolean;
  regime: string;
}

interface SectionB {
  totalRelevantFunds: {
    eMoney: number;
    payment: number;
    total: number;
  };
  d1Requirement: { high: number; low: number; average: number };
  d1Resource: { high: number; low: number; average: number };
  reconciliationDaysCount: number;
  internalReconConfirmations: number;
  externalReconConfirmations: number;
  shortfallDaysCount: number;
  largestShortfall: number;
  unresolvedDiscrepancies: number;
}

interface AccountDetail {
  bankName: string;
  jurisdiction: string;
  accountType: string;
  currency: string;
  balance: number;
}

interface SectionC {
  accounts: AccountDetail[];
  totalAccounts: number;
  totalBalance: number;
}

interface CustodianAsset {
  custodianName: string;
  assetType: string;
  value: number;
  currency: string;
}

interface SectionD {
  assets: CustodianAsset[];
  totalValue: number;
}

interface SectionE {
  applicable: boolean;
  insurerName?: string;
  policyNumber?: string;
  coverageType?: string;
  coverageAmount?: number;
  coverageCurrency?: string;
  effectiveDate?: string;
  expiryDate?: string;
}

interface SectionF {
  breachCount: number;
  fcaNotificationCount: number;
  openBreaches: number;
  breachesBySeverity: Record<string, number>;
}

interface MonthlyReturnData {
  id: string;
  firmId: string;
  reportingMonth: string;
  status: string;
  sectionA: SectionA;
  sectionB: SectionB;
  sectionC: SectionC;
  sectionD: SectionD;
  sectionE: SectionE;
  sectionF: SectionF;
  submissionDeadline: string;
  createdAt: string;
}

// ─── Helper ─────────────────────────────────────────────────────────────────

function getMonthBounds(reportingMonth: string): { start: Date; end: Date } {
  const [year, month] = reportingMonth.split('-').map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0); // last day of month
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// ─── Main Functions ─────────────────────────────────────────────────────────

export async function generateMonthlyReturn(firmId: string, reportingMonth: string): Promise<MonthlyReturnData> {
  const firm = await prisma.firm.findUnique({ where: { id: firmId } });
  if (!firm) throw new NotFoundError('Firm');

  const { start, end } = getMonthBounds(reportingMonth);

  // Check for duplicate
  const existing = await prisma.fcaMonthlyReturn.findFirst({
    where: { firmId, reportingMonth: start },
  });
  if (existing && existing.status === 'FINAL') {
    throw new ValidationError('A finalised return already exists for this month. Cannot regenerate.');
  }

  // Fetch all required data in parallel
  const [
    reconciliationRuns,
    safeguardingAccounts,
    bankBalances,
    clientAssets,
    insurancePolicies,
    breaches,
    clientAccounts,
  ] = await Promise.all([
    prisma.reconciliationRun.findMany({
      where: { firmId, reconciliationDate: { gte: start, lte: end } },
      orderBy: { reconciliationDate: 'asc' },
    }),
    prisma.safeguardingAccount.findMany({
      where: { firmId, status: 'ACTIVE' },
    }),
    prisma.bankBalance.findMany({
      where: { firmId, balanceDate: { gte: start, lte: end } },
      orderBy: { balanceDate: 'desc' },
    }),
    prisma.clientAsset.findMany({
      where: { firmId, status: 'HELD', recordDate: { gte: start, lte: end } },
    }),
    prisma.insuranceGuarantee.findMany({
      where: { firmId, status: 'ACTIVE' },
    }),
    prisma.breach.findMany({
      where: { firmId, createdAt: { gte: start, lte: end } },
    }),
    prisma.clientAccount.findMany({
      where: { firmId, status: 'ACTIVE' },
    }),
  ]);

  // ─── Section A: Firm details ───
  const sectionA: SectionA = {
    firmName: firm.name,
    fcaFrn: firm.fcaFrn,
    reportingMonth,
    safeguardingMethod: firm.safeguardingMethod,
    reconciliationMethod: 'INTERNAL', // Default — most firms use internal
    auditExemptionStatus: false, // Default
    regime: firm.regime,
  };

  // ─── Section B: Relevant funds ───
  const internalRuns = reconciliationRuns.filter(r => r.reconciliationType === 'INTERNAL');
  const externalRuns = reconciliationRuns.filter(r => r.reconciliationType === 'EXTERNAL');

  const requirements = internalRuns.map(r => Number(r.totalRequirement));
  const resources = internalRuns.map(r => Number(r.totalResource));
  const shortfallRuns = internalRuns.filter(r => r.status === 'SHORTFALL');

  // Split e-money vs payment based on fund type
  const eMoneyRuns = internalRuns.filter(r => r.fundType === 'E_MONEY');
  const paymentRuns = internalRuns.filter(r => r.fundType === 'PAYMENT_SERVICES' || r.fundType === 'ALL');
  const eMoneyTotal = eMoneyRuns.reduce((sum, r) => sum + Number(r.totalRequirement), 0);
  const paymentTotal = paymentRuns.reduce((sum, r) => sum + Number(r.totalRequirement), 0);

  const sectionB: SectionB = {
    totalRelevantFunds: {
      eMoney: eMoneyTotal,
      payment: paymentTotal,
      total: eMoneyTotal + paymentTotal,
    },
    d1Requirement: {
      high: requirements.length > 0 ? Math.max(...requirements) : 0,
      low: requirements.length > 0 ? Math.min(...requirements) : 0,
      average: requirements.length > 0 ? requirements.reduce((a, b) => a + b, 0) / requirements.length : 0,
    },
    d1Resource: {
      high: resources.length > 0 ? Math.max(...resources) : 0,
      low: resources.length > 0 ? Math.min(...resources) : 0,
      average: resources.length > 0 ? resources.reduce((a, b) => a + b, 0) / resources.length : 0,
    },
    reconciliationDaysCount: internalRuns.length,
    internalReconConfirmations: internalRuns.filter(r => r.status === 'MET').length,
    externalReconConfirmations: externalRuns.filter(r => r.status === 'MET').length,
    shortfallDaysCount: shortfallRuns.length,
    largestShortfall: shortfallRuns.length > 0
      ? Math.max(...shortfallRuns.map(r => Math.abs(Number(r.variance))))
      : 0,
    unresolvedDiscrepancies: internalRuns.filter(r => r.status !== 'MET').length,
  };

  // ─── Section C: Per-account details ───
  // Get latest balance per account
  const latestBalancePerAccount: Record<string, typeof bankBalances[0]> = {};
  for (const bal of bankBalances) {
    if (!latestBalancePerAccount[bal.safeguardingAccountId]) {
      latestBalancePerAccount[bal.safeguardingAccountId] = bal;
    }
  }

  const accountDetails: AccountDetail[] = safeguardingAccounts.map(acc => {
    const latestBal = latestBalancePerAccount[acc.id];
    return {
      bankName: acc.bankName,
      jurisdiction: 'UK', // Default jurisdiction
      accountType: acc.designation,
      currency: acc.currency,
      balance: latestBal ? Number(latestBal.closingBalance) : 0,
    };
  });

  const sectionC: SectionC = {
    accounts: accountDetails,
    totalAccounts: accountDetails.length,
    totalBalance: accountDetails.reduce((sum, a) => sum + a.balance, 0),
  };

  // ─── Section D: Per-custodian assets ───
  const custodianMap: Record<string, CustodianAsset> = {};
  for (const asset of clientAssets) {
    const key = `${asset.custodian || 'Unknown'}-${asset.assetType}-${asset.currency}`;
    if (!custodianMap[key]) {
      custodianMap[key] = {
        custodianName: asset.custodian || 'Unknown',
        assetType: asset.assetType,
        value: 0,
        currency: asset.currency,
      };
    }
    custodianMap[key].value += Number(asset.marketValue || 0);
  }

  const assetDetails: CustodianAsset[] = Object.values(custodianMap);
  const sectionD: SectionD = {
    assets: assetDetails,
    totalValue: assetDetails.reduce((sum, a) => sum + a.value, 0),
  };

  // ─── Section E: Insurance/guarantee ───
  const hasInsurance = firm.safeguardingMethod === 'INSURANCE' || firm.safeguardingMethod === 'GUARANTEE' || firm.safeguardingMethod === 'MIXED';
  const primaryPolicy = insurancePolicies[0];
  const sectionE: SectionE = {
    applicable: hasInsurance,
    ...(hasInsurance && primaryPolicy ? {
      insurerName: primaryPolicy.insurerName,
      policyNumber: primaryPolicy.policyNumber,
      coverageType: primaryPolicy.coverageType,
      coverageAmount: Number(primaryPolicy.coverageAmount),
      coverageCurrency: primaryPolicy.coverageCurrency,
      effectiveDate: primaryPolicy.effectiveDate.toISOString().split('T')[0],
      expiryDate: primaryPolicy.expiryDate.toISOString().split('T')[0],
    } : {}),
  };

  // ─── Section F: Breaches ───
  const notifiableBreaches = breaches.filter(b => b.isNotifiable);
  const openBreaches = breaches.filter(b => !['RESOLVED', 'CLOSED'].includes(b.status));

  const sectionF: SectionF = {
    breachCount: breaches.length,
    fcaNotificationCount: notifiableBreaches.length,
    openBreaches: openBreaches.length,
    breachesBySeverity: {
      CRITICAL: breaches.filter(b => b.severity === 'CRITICAL').length,
      HIGH: breaches.filter(b => b.severity === 'HIGH').length,
      MEDIUM: breaches.filter(b => b.severity === 'MEDIUM').length,
      LOW: breaches.filter(b => b.severity === 'LOW').length,
    },
  };

  // Submission deadline: 30 business days after month-end
  const submissionDeadline = new Date(end);
  submissionDeadline.setDate(submissionDeadline.getDate() + 42); // ~30 business days

  // Upsert the return
  const returnRecord = existing
    ? await prisma.fcaMonthlyReturn.update({
        where: { id: existing.id },
        data: {
          sectionA: sectionA as any,
          sectionB: sectionB as any,
          sectionC: sectionC as any,
          sectionD: sectionD as any,
          sectionE: sectionE as any,
          sectionF: sectionF as any,
          submissionDeadline,
          status: 'DRAFT',
        },
      })
    : await prisma.fcaMonthlyReturn.create({
        data: {
          firmId,
          reportingMonth: start,
          submissionDeadline,
          status: 'DRAFT',
          sectionA: sectionA as any,
          sectionB: sectionB as any,
          sectionC: sectionC as any,
          sectionD: sectionD as any,
          sectionE: sectionE as any,
          sectionF: sectionF as any,
        },
      });

  logger.info({ firmId, reportingMonth, returnId: returnRecord.id }, 'FCA monthly return generated');

  return {
    id: returnRecord.id,
    firmId,
    reportingMonth,
    status: returnRecord.status,
    sectionA,
    sectionB,
    sectionC,
    sectionD,
    sectionE,
    sectionF,
    submissionDeadline: submissionDeadline.toISOString().split('T')[0],
    createdAt: returnRecord.createdAt.toISOString(),
  };
}

export async function getMonthlyReturns(firmId: string): Promise<{
  returns: Array<{
    id: string;
    reportingMonth: string;
    status: string;
    submissionDeadline: string;
    completeness: string;
    createdAt: string;
  }>;
}> {
  const firm = await prisma.firm.findUnique({ where: { id: firmId } });
  if (!firm) throw new NotFoundError('Firm');

  const returns = await prisma.fcaMonthlyReturn.findMany({
    where: { firmId },
    orderBy: { reportingMonth: 'desc' },
  });

  return {
    returns: returns.map(r => {
      const sectionB = r.sectionB as any;
      const sectionC = r.sectionC as any;
      const sectionF = r.sectionF as any;
      return {
        id: r.id,
        reportingMonth: r.reportingMonth.toISOString().split('T')[0].slice(0, 7),
        status: r.status,
        submissionDeadline: r.submissionDeadline.toISOString().split('T')[0],
        completeness: sectionB && sectionC && sectionF ? 'COMPLETE' : 'PARTIAL',
        createdAt: r.createdAt.toISOString(),
      };
    }),
  };
}

export async function finaliseReturn(firmId: string, returnId: string, userId: string): Promise<{ id: string; status: string; finalisedAt: string }> {
  const record = await prisma.fcaMonthlyReturn.findFirst({
    where: { id: returnId, firmId },
  });
  if (!record) throw new NotFoundError('FCA Monthly Return');
  if (record.status === 'FINAL' || record.status === 'SUBMITTED') {
    throw new ValidationError(`Return is already ${record.status} and cannot be re-finalised.`);
  }

  // Validate before finalising
  const validation = await validateReturnInternal(record);
  if (validation.errors.length > 0) {
    throw new ValidationError(`Cannot finalise — ${validation.errors.length} validation error(s): ${validation.errors[0].message}`);
  }

  const updated = await prisma.fcaMonthlyReturn.update({
    where: { id: returnId },
    data: {
      status: 'FINAL',
      finalisedBy: userId,
      finalisedAt: new Date(),
      validationErrors: undefined,
    },
  });

  logger.info({ firmId, returnId, userId }, 'FCA monthly return finalised');

  return {
    id: updated.id,
    status: updated.status,
    finalisedAt: updated.finalisedAt!.toISOString(),
  };
}

interface ValidationResult {
  isValid: boolean;
  errors: Array<{ field: string; message: string }>;
  warnings: Array<{ field: string; message: string }>;
}

function validateReturnInternal(record: {
  sectionA: any; sectionB: any; sectionC: any; sectionD: any; sectionE: any; sectionF: any;
}): ValidationResult {
  const errors: Array<{ field: string; message: string }> = [];
  const warnings: Array<{ field: string; message: string }> = [];

  const sA = record.sectionA as SectionA;
  const sB = record.sectionB as SectionB;
  const sC = record.sectionC as SectionC;
  const sE = record.sectionE as SectionE;

  // Section A validation
  if (!sA.firmName) errors.push({ field: 'sectionA.firmName', message: 'Firm name is required' });
  if (!sA.safeguardingMethod) errors.push({ field: 'sectionA.safeguardingMethod', message: 'Safeguarding method is required' });

  // Section B validation
  if (sB.reconciliationDaysCount === 0) {
    warnings.push({ field: 'sectionB.reconciliationDaysCount', message: 'No reconciliation runs found for this period' });
  }
  if (sB.shortfallDaysCount > 0) {
    warnings.push({ field: 'sectionB.shortfallDaysCount', message: `${sB.shortfallDaysCount} shortfall day(s) detected` });
  }
  if (sB.unresolvedDiscrepancies > 0) {
    warnings.push({ field: 'sectionB.unresolvedDiscrepancies', message: `${sB.unresolvedDiscrepancies} unresolved discrepancy(ies)` });
  }

  // Section C validation
  if (sC.totalAccounts === 0) {
    errors.push({ field: 'sectionC.totalAccounts', message: 'No safeguarding accounts found — at least one is required' });
  }

  // Section B/C cross-check: total resource should approximately match total balance
  if (sC.totalBalance > 0 && sB.d1Resource.average > 0) {
    const ratio = sC.totalBalance / sB.d1Resource.average;
    if (ratio < 0.5 || ratio > 2.0) {
      warnings.push({ field: 'sectionB/C', message: 'Large discrepancy between account balances and reconciliation resource figures' });
    }
  }

  // Section E validation
  if (sE.applicable && !sE.insurerName) {
    errors.push({ field: 'sectionE.insurerName', message: 'Insurance/guarantee details required for non-segregation methods' });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

export async function validateReturn(firmId: string, returnId: string): Promise<ValidationResult> {
  const record = await prisma.fcaMonthlyReturn.findFirst({
    where: { id: returnId, firmId },
  });
  if (!record) throw new NotFoundError('FCA Monthly Return');

  const result = validateReturnInternal(record);

  // Persist validation errors
  await prisma.fcaMonthlyReturn.update({
    where: { id: returnId },
    data: {
      validationErrors: result.errors.length > 0 ? result.errors as any : null,
    },
  });

  return result;
}

export async function exportReturnPdf(firmId: string, returnId: string): Promise<Buffer> {
  const firm = await prisma.firm.findUnique({ where: { id: firmId } });
  if (!firm) throw new NotFoundError('Firm');

  const record = await prisma.fcaMonthlyReturn.findFirst({
    where: { id: returnId, firmId },
  });
  if (!record) throw new NotFoundError('FCA Monthly Return');

  const sA = record.sectionA as unknown as SectionA;
  const sB = record.sectionB as unknown as SectionB;
  const sC = record.sectionC as unknown as SectionC;
  const sD = record.sectionD as unknown as SectionD;
  const sE = record.sectionE as unknown as SectionE | null;
  const sF = record.sectionF as unknown as SectionF;

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: 'A4', margin: 50 });

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PAGE_MARGIN = 50;
    const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2;
    const NAVY = '#0C1445';
    const ACCENT = '#3D3DFF';
    const WHITE = '#FFFFFF';
    const TEXT_PRIMARY = '#0F172A';
    const TEXT_SECONDARY = '#64748B';
    const LIGHT_GRAY = '#F1F5F9';

    // ─── Header ───
    doc.rect(0, 0, 595.28, 80).fill(NAVY);
    doc.font('Helvetica-Bold').fontSize(20).fillColor(WHITE)
      .text('Safeheld', PAGE_MARGIN, 22);
    doc.font('Helvetica').fontSize(10).fillColor('#94A3B8')
      .text(firm.name, PAGE_MARGIN, 28, { width: CONTENT_WIDTH, align: 'right' });
    doc.rect(0, 80, 595.28, 4).fill(ACCENT);

    doc.font('Helvetica-Bold').fontSize(18).fillColor(TEXT_PRIMARY)
      .text('FCA Monthly Safeguarding Return', PAGE_MARGIN, 100);
    doc.font('Helvetica').fontSize(9).fillColor(TEXT_SECONDARY)
      .text(`Reporting Month: ${sA.reportingMonth} | Status: ${record.status} | Generated ${new Date().toISOString().split('T')[0]}`, PAGE_MARGIN, 124);

    doc.y = 150;

    // Helper to add a section title
    const addSection = (title: string) => {
      if (doc.y > 700) { doc.addPage(); doc.y = 50; }
      doc.moveDown(0.5);
      doc.rect(PAGE_MARGIN, doc.y, CONTENT_WIDTH, 24).fill(NAVY);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(WHITE)
        .text(title, PAGE_MARGIN + 8, doc.y + 6);
      doc.y += 30;
    };

    // Helper to add a key-value row
    const addRow = (label: string, value: string, highlight = false) => {
      if (doc.y > 750) { doc.addPage(); doc.y = 50; }
      if (highlight) {
        doc.rect(PAGE_MARGIN, doc.y, CONTENT_WIDTH, 16).fill(LIGHT_GRAY);
      }
      doc.font('Helvetica-Bold').fontSize(8).fillColor(TEXT_PRIMARY)
        .text(label, PAGE_MARGIN + 4, doc.y + 3, { width: 200 });
      doc.font('Helvetica').fontSize(8).fillColor(TEXT_PRIMARY)
        .text(value, PAGE_MARGIN + 210, doc.y + 3, { width: CONTENT_WIDTH - 214 });
      doc.y += 16;
    };

    // ─── Section A ───
    addSection('Section A — Firm Details');
    addRow('Firm Name', sA.firmName, true);
    addRow('FCA FRN', sA.fcaFrn || 'N/A');
    addRow('Reporting Month', sA.reportingMonth, true);
    addRow('Safeguarding Method', sA.safeguardingMethod);
    addRow('Reconciliation Method', sA.reconciliationMethod, true);
    addRow('Audit Exemption', sA.auditExemptionStatus ? 'Yes' : 'No');
    addRow('Regime', sA.regime, true);

    // ─── Section B ───
    addSection('Section B — Relevant Funds & Reconciliation');
    addRow('Total Relevant Funds (E-Money)', fmtNum(sB.totalRelevantFunds.eMoney), true);
    addRow('Total Relevant Funds (Payment)', fmtNum(sB.totalRelevantFunds.payment));
    addRow('Total Relevant Funds', fmtNum(sB.totalRelevantFunds.total), true);
    addRow('D+1 Requirement (High / Low / Avg)', `${fmtNum(sB.d1Requirement.high)} / ${fmtNum(sB.d1Requirement.low)} / ${fmtNum(sB.d1Requirement.average)}`);
    addRow('D+1 Resource (High / Low / Avg)', `${fmtNum(sB.d1Resource.high)} / ${fmtNum(sB.d1Resource.low)} / ${fmtNum(sB.d1Resource.average)}`, true);
    addRow('Reconciliation Days', String(sB.reconciliationDaysCount));
    addRow('Internal Recon Confirmations', String(sB.internalReconConfirmations), true);
    addRow('External Recon Confirmations', String(sB.externalReconConfirmations));
    addRow('Shortfall Days', String(sB.shortfallDaysCount), true);
    addRow('Largest Shortfall', fmtNum(sB.largestShortfall));
    addRow('Unresolved Discrepancies', String(sB.unresolvedDiscrepancies), true);

    // ─── Section C ───
    addSection('Section C — Safeguarding Accounts');
    addRow('Total Accounts', String(sC.totalAccounts), true);
    addRow('Total Balance', fmtNum(sC.totalBalance));
    doc.moveDown(0.3);

    // Accounts table
    for (let i = 0; i < sC.accounts.length && i < 30; i++) {
      const acc = sC.accounts[i];
      if (doc.y > 740) { doc.addPage(); doc.y = 50; }
      addRow(`  ${acc.bankName} (${acc.currency})`, `${acc.accountType} | ${fmtNum(acc.balance)}`, i % 2 === 0);
    }

    // ─── Section D ───
    addSection('Section D — Relevant Assets');
    addRow('Total Asset Value', fmtNum(sD.totalValue), true);
    for (let i = 0; i < sD.assets.length && i < 30; i++) {
      const a = sD.assets[i];
      if (doc.y > 740) { doc.addPage(); doc.y = 50; }
      addRow(`  ${a.custodianName} (${a.assetType})`, `${fmtNum(a.value)} ${a.currency}`, i % 2 === 0);
    }

    // ─── Section E ───
    addSection('Section E — Insurance / Guarantee');
    if (sE && sE.applicable) {
      addRow('Insurer', sE.insurerName || 'N/A', true);
      addRow('Policy Number', sE.policyNumber || 'N/A');
      addRow('Coverage Type', sE.coverageType || 'N/A', true);
      addRow('Coverage Amount', sE.coverageAmount ? `${fmtNum(sE.coverageAmount)} ${sE.coverageCurrency || ''}` : 'N/A');
      addRow('Effective Date', sE.effectiveDate || 'N/A', true);
      addRow('Expiry Date', sE.expiryDate || 'N/A');
    } else {
      addRow('Status', 'Not applicable — firm uses segregation method', true);
    }

    // ─── Section F ───
    addSection('Section F — Breaches');
    addRow('Total Breaches', String(sF.breachCount), true);
    addRow('FCA Notifications', String(sF.fcaNotificationCount));
    addRow('Open Breaches', String(sF.openBreaches), true);
    addRow('Critical', String(sF.breachesBySeverity?.CRITICAL || 0));
    addRow('High', String(sF.breachesBySeverity?.HIGH || 0), true);
    addRow('Medium', String(sF.breachesBySeverity?.MEDIUM || 0));
    addRow('Low', String(sF.breachesBySeverity?.LOW || 0), true);

    // Footer
    doc.moveDown(2);
    doc.font('Helvetica').fontSize(8).fillColor(TEXT_SECONDARY)
      .text('This document is auto-generated by Safeheld for FCA regulatory reporting purposes. Data should be reviewed before submission.', PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });

    doc.end();
  });
}

function fmtNum(n: number | null | undefined): string {
  const num = Number(n ?? 0);
  return num.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function exportReturnData(firmId: string, returnId: string): Promise<object> {
  const record = await prisma.fcaMonthlyReturn.findFirst({
    where: { id: returnId, firmId },
  });
  if (!record) throw new NotFoundError('FCA Monthly Return');

  return {
    id: record.id,
    firmId: record.firmId,
    reportingMonth: record.reportingMonth.toISOString().split('T')[0].slice(0, 7),
    status: record.status,
    submissionDeadline: record.submissionDeadline.toISOString().split('T')[0],
    sectionA: record.sectionA,
    sectionB: record.sectionB,
    sectionC: record.sectionC,
    sectionD: record.sectionD,
    sectionE: record.sectionE,
    sectionF: record.sectionF,
    validationErrors: record.validationErrors,
    finalisedBy: record.finalisedBy,
    finalisedAt: record.finalisedAt?.toISOString() || null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
