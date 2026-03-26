import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';
import { fileStorage } from '../../utils/fileStorage';
import { FcaFormType, Prisma } from '@prisma/client';

// ─── PDF Constants ──────────────────────────────────────────────────────────

const NAVY = '#0C1445';
const ACCENT = '#3D3DFF';
const WHITE = '#FFFFFF';
const LIGHT_GRAY = '#F1F5F9';
const BORDER = '#CBD5E1';
const TEXT_PRIMARY = '#0F172A';
const TEXT_SECONDARY = '#64748B';
const PAGE_MARGIN = 50;
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2;

function fmtDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtNum(n: number | string | null | undefined, decimals = 2): string {
  const num = Number(n ?? 0);
  return num.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed > 770) { doc.addPage(); doc.y = PAGE_MARGIN; }
}

function addHeader(doc: PDFKit.PDFDocument, title: string, firmName: string, subtitle?: string) {
  doc.rect(0, 0, 595.28, 80).fill(NAVY);
  doc.font('Helvetica-Bold').fontSize(20).fillColor(WHITE)
    .text('Safeheld', PAGE_MARGIN, 22, { continued: false });
  doc.font('Helvetica').fontSize(10).fillColor('#94A3B8')
    .text(firmName, PAGE_MARGIN, 28, { width: CONTENT_WIDTH, align: 'right' });
  doc.rect(0, 80, 595.28, 4).fill(ACCENT);
  const titleY = 100;
  doc.font('Helvetica-Bold').fontSize(18).fillColor(TEXT_PRIMARY).text(title, PAGE_MARGIN, titleY);
  const sub = subtitle || `Generated ${fmtDate(new Date())}`;
  doc.font('Helvetica').fontSize(9).fillColor(TEXT_SECONDARY).text(sub, PAGE_MARGIN, titleY + 24);
  doc.y = titleY + 48;
}

function addSectionTitle(doc: PDFKit.PDFDocument, title: string) {
  ensureSpace(doc, 40);
  doc.moveDown(0.8);
  doc.rect(PAGE_MARGIN, doc.y, CONTENT_WIDTH, 28).fill(NAVY);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(WHITE)
    .text(title, PAGE_MARGIN + 10, doc.y + 8, { width: CONTENT_WIDTH - 20 });
  doc.y += 28;
  doc.moveDown(0.3);
}

function addFieldRow(doc: PDFKit.PDFDocument, label: string, value: string, isManual = false) {
  ensureSpace(doc, 18);
  const y = doc.y;
  doc.font('Helvetica').fontSize(9).fillColor(TEXT_SECONDARY)
    .text(label, PAGE_MARGIN, y, { width: 200 });
  doc.font('Helvetica-Bold').fontSize(9).fillColor(isManual ? '#D97706' : TEXT_PRIMARY)
    .text(value, PAGE_MARGIN + 205, y, { width: CONTENT_WIDTH - 205 });
  doc.y = y + 16;
}

function addFooter(doc: PDFKit.PDFDocument, formType: string) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.font('Helvetica').fontSize(7).fillColor(TEXT_SECONDARY)
      .text(`Safeheld  |  ${formType}  |  Confidential  |  Page ${i + 1} of ${range.count}`,
        PAGE_MARGIN, 795, { width: CONTENT_WIDTH, align: 'center' });
  }
}

// ─── FSA056 - Authorised PI Capital Adequacy ────────────────────────────────

export async function generateFSA056(firmId: string, periodStart: string, periodEnd: string) {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: {
      name: true, fcaFrn: true, regime: true, safeguardingMethod: true, baseCurrency: true,
    },
  });
  if (!firm) throw new Error('Firm not found');

  const startDate = new Date(periodStart);
  const endDate = new Date(periodEnd + 'T23:59:59.999Z');

  // Auto-populate from reconciliation data
  const reconRuns = await prisma.reconciliationRun.findMany({
    where: { firmId, reconciliationType: 'INTERNAL', reconciliationDate: { gte: startDate, lte: endDate } },
    orderBy: { reconciliationDate: 'desc' },
    select: { totalRequirement: true, totalResource: true, currency: true, reconciliationDate: true },
  });

  // Get safeguarding accounts
  const safeguardingAccounts = await prisma.safeguardingAccount.findMany({
    where: { firmId, status: 'ACTIVE' },
    select: { bankName: true, accountNumberMasked: true, currency: true, fundType: true },
  });

  // Calculate total relevant funds (latest recon per currency)
  const latestByCurrency: Record<string, { requirement: number; resource: number; date: Date }> = {};
  for (const run of reconRuns) {
    if (!latestByCurrency[run.currency]) {
      latestByCurrency[run.currency] = {
        requirement: Number(run.totalRequirement ?? 0),
        resource: Number(run.totalResource ?? 0),
        date: run.reconciliationDate,
      };
    }
  }

  const totalRelevantFunds = Object.values(latestByCurrency).reduce((sum, v) => sum + v.requirement, 0);
  const totalSafeguarded = Object.values(latestByCurrency).reduce((sum, v) => sum + v.resource, 0);

  const autoPopulatedData = {
    firmName: firm.name,
    firmFrn: firm.fcaFrn,
    reportingPeriod: { start: periodStart, end: periodEnd },
    safeguardingMethod: firm.safeguardingMethod,
    totalRelevantFunds,
    totalSafeguarded,
    safeguardingAccountDetails: safeguardingAccounts.map(a => ({
      bankName: a.bankName,
      accountNumber: a.accountNumberMasked,
      currency: a.currency,
      fundType: a.fundType,
    })),
    fundsByurrency: latestByCurrency,
    baseCurrency: firm.baseCurrency,
  };

  const manualFieldsRequired = [
    { field: 'ownFundsRequirement', description: 'Own Funds Requirement (calculated per FCA rules)', type: 'number' },
    { field: 'ownFundsHeld', description: 'Own Funds Actually Held', type: 'number' },
    { field: 'methodACapitalRequirement', description: 'Method A - Fixed overhead requirement', type: 'number' },
    { field: 'methodBCapitalRequirement', description: 'Method B - Based on payment volume', type: 'number' },
    { field: 'methodCCapitalRequirement', description: 'Method C - Based on relevant income', type: 'number' },
    { field: 'capitalMethodUsed', description: 'Capital calculation method used (A/B/C)', type: 'string' },
    { field: 'professionalIndemnityInsurance', description: 'Professional Indemnity Insurance details', type: 'string' },
  ];

  const submission = await prisma.fcaFormSubmission.create({
    data: {
      firmId,
      formType: 'FSA056',
      reportingPeriodStart: startDate,
      reportingPeriodEnd: new Date(periodEnd),
      autoPopulatedData: autoPopulatedData as unknown as Prisma.InputJsonValue,
      manualFields: manualFieldsRequired as unknown as Prisma.InputJsonValue,
      status: 'DRAFT',
    },
  });

  logger.info({ firmId, formId: submission.id }, 'FSA056 form generated');
  return { submission, autoPopulatedData, manualFieldsRequired };
}

// ─── FSA057 - PSD Transaction Return ────────────────────────────────────────

export async function generateFSA057(firmId: string, periodStart: string, periodEnd: string) {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { name: true, fcaFrn: true, regime: true, baseCurrency: true },
  });
  if (!firm) throw new Error('Firm not found');

  const startDate = new Date(periodStart);
  const endDate = new Date(periodEnd + 'T23:59:59.999Z');

  // Pull transaction volumes from client transactions
  const transactions = await prisma.clientTransaction.findMany({
    where: { firmId, transactionDate: { gte: startDate, lte: endDate } },
    select: { amount: true, currency: true, direction: true },
  });

  const transactionSummary: Record<string, { count: number; totalAmount: number }> = {};
  for (const tx of transactions) {
    const key = `${tx.currency}_${tx.direction}`;
    if (!transactionSummary[key]) {
      transactionSummary[key] = { count: 0, totalAmount: 0 };
    }
    transactionSummary[key].count++;
    transactionSummary[key].totalAmount += Number(tx.amount);
  }

  const totalTransactionCount = transactions.length;
  const totalTransactionValue = transactions.reduce((sum, tx) => sum + Number(tx.amount), 0);

  // Group by currency
  const byCurrency: Record<string, { count: number; totalValue: number }> = {};
  for (const tx of transactions) {
    if (!byCurrency[tx.currency]) byCurrency[tx.currency] = { count: 0, totalValue: 0 };
    byCurrency[tx.currency].count++;
    byCurrency[tx.currency].totalValue += Number(tx.amount);
  }

  const autoPopulatedData = {
    firmName: firm.name,
    firmFrn: firm.fcaFrn,
    reportingPeriod: { start: periodStart, end: periodEnd },
    totalTransactionCount,
    totalTransactionValue,
    transactionsByCurrency: byCurrency,
    transactionsByType: transactionSummary,
    baseCurrency: firm.baseCurrency,
  };

  const manualFieldsRequired = [
    { field: 'domesticPaymentTransactions', description: 'Number of domestic payment transactions', type: 'number' },
    { field: 'crossBorderPaymentTransactions', description: 'Number of cross-border payment transactions', type: 'number' },
    { field: 'moneyRemittanceTransactions', description: 'Number of money remittance transactions', type: 'number' },
    { field: 'digitalPaymentTransactions', description: 'Number of digital/online payment transactions', type: 'number' },
    { field: 'agentTransactionVolume', description: 'Transaction volume through agents', type: 'number' },
    { field: 'numberOfActiveAgents', description: 'Number of active agents/distributors', type: 'number' },
  ];

  const submission = await prisma.fcaFormSubmission.create({
    data: {
      firmId,
      formType: 'FSA057',
      reportingPeriodStart: startDate,
      reportingPeriodEnd: new Date(periodEnd),
      autoPopulatedData: autoPopulatedData as unknown as Prisma.InputJsonValue,
      manualFields: manualFieldsRequired as unknown as Prisma.InputJsonValue,
      status: 'DRAFT',
    },
  });

  logger.info({ firmId, formId: submission.id }, 'FSA057 form generated');
  return { submission, autoPopulatedData, manualFieldsRequired };
}

// ─── FIN060a - Authorised EMI Quarterly Return ──────────────────────────────

export async function generateFIN060a(firmId: string, periodStart: string, periodEnd: string) {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: {
      name: true, fcaFrn: true, regime: true, safeguardingMethod: true, baseCurrency: true,
    },
  });
  if (!firm) throw new Error('Firm not found');

  const startDate = new Date(periodStart);
  const endDate = new Date(periodEnd + 'T23:59:59.999Z');

  // Get reconciliation data for outstanding e-money calculation
  const latestRecon = await prisma.reconciliationRun.findFirst({
    where: { firmId, reconciliationType: 'INTERNAL', reconciliationDate: { lte: endDate } },
    orderBy: { reconciliationDate: 'desc' },
    select: { totalRequirement: true, totalResource: true, currency: true, reconciliationDate: true },
  });

  // Get all recon runs in period for average calculation
  const periodRecons = await prisma.reconciliationRun.findMany({
    where: { firmId, reconciliationType: 'INTERNAL', reconciliationDate: { gte: startDate, lte: endDate } },
    select: { totalRequirement: true, totalResource: true, reconciliationDate: true },
  });

  const avgOutstandingEMoney = periodRecons.length > 0
    ? periodRecons.reduce((sum, r) => sum + Number(r.totalRequirement ?? 0), 0) / periodRecons.length
    : 0;

  // Get safeguarding accounts
  const safeguardingAccounts = await prisma.safeguardingAccount.findMany({
    where: { firmId, status: 'ACTIVE' },
    select: { bankName: true, accountNumberMasked: true, currency: true, designation: true },
  });

  // Get client balances for latest snapshot
  const latestBalance = await prisma.clientBalance.findFirst({
    where: { firmId, balanceDate: { lte: endDate } },
    orderBy: { balanceDate: 'desc' },
    select: { balance: true, currency: true, balanceDate: true },
  });

  const outstandingEMoney = Number(latestRecon?.totalRequirement ?? 0);
  const relevantFundsHeld = Number(latestRecon?.totalResource ?? 0);

  const autoPopulatedData = {
    firmName: firm.name,
    firmFrn: firm.fcaFrn,
    reportingPeriod: { start: periodStart, end: periodEnd },
    outstandingEMoney,
    averageOutstandingEMoney: Number(avgOutstandingEMoney.toFixed(2)),
    relevantFundsHeld,
    safeguardingMethod: firm.safeguardingMethod,
    safeguardingAccounts: safeguardingAccounts.map(a => ({
      bankName: a.bankName,
      accountNumber: a.accountNumberMasked,
      currency: a.currency,
      designation: a.designation,
    })),
    latestReconDate: latestRecon?.reconciliationDate || null,
    baseCurrency: firm.baseCurrency,
  };

  const manualFieldsRequired = [
    { field: 'ownFundsRequirement', description: 'Own funds requirement', type: 'number' },
    { field: 'ownFundsHeld', description: 'Own funds held', type: 'number' },
    { field: 'averageOutstandingEMoneyOverride', description: 'Average outstanding e-money (override if different)', type: 'number' },
    { field: 'totalDistributed', description: 'Total e-money distributed through agents', type: 'number' },
    { field: 'numberOfRedemptions', description: 'Number of redemptions in period', type: 'number' },
    { field: 'totalRedemptionValue', description: 'Total value of redemptions', type: 'number' },
    { field: 'numberOfComplaints', description: 'Number of complaints received', type: 'number' },
    { field: 'interestIncome', description: 'Interest income on safeguarded funds', type: 'number' },
  ];

  const submission = await prisma.fcaFormSubmission.create({
    data: {
      firmId,
      formType: 'FIN060A',
      reportingPeriodStart: startDate,
      reportingPeriodEnd: new Date(periodEnd),
      autoPopulatedData: autoPopulatedData as unknown as Prisma.InputJsonValue,
      manualFields: manualFieldsRequired as unknown as Prisma.InputJsonValue,
      status: 'DRAFT',
    },
  });

  logger.info({ firmId, formId: submission.id }, 'FIN060a form generated');
  return { submission, autoPopulatedData, manualFieldsRequired };
}

// ─── Common Functions ───────────────────────────────────────────────────────

export async function getForms(firmId: string) {
  return prisma.fcaFormSubmission.findMany({
    where: { firmId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getForm(firmId: string, formId: string) {
  const form = await prisma.fcaFormSubmission.findFirst({
    where: { id: formId, firmId },
  });
  if (!form) throw new Error('FCA form not found');
  return form;
}

export async function exportFormPdf(firmId: string, formId: string): Promise<Buffer> {
  const form = await prisma.fcaFormSubmission.findFirst({
    where: { id: formId, firmId },
  });
  if (!form) throw new Error('FCA form not found');

  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { name: true, fcaFrn: true },
  });

  const autoData = form.autoPopulatedData as Record<string, any>;
  const manualFields = (form.manualFields || []) as Array<{ field: string; description: string; type: string }>;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const formTitle = getFormTitle(form.formType);
    addHeader(doc, formTitle, firm?.name || 'Unknown',
      `Period: ${fmtDate(form.reportingPeriodStart)} - ${fmtDate(form.reportingPeriodEnd)}`);

    // Firm Details
    addSectionTitle(doc, 'Firm Details');
    addFieldRow(doc, 'Firm Name', autoData.firmName || firm?.name || 'N/A');
    addFieldRow(doc, 'FCA FRN', autoData.firmFrn || firm?.fcaFrn || 'N/A');
    addFieldRow(doc, 'Form Type', form.formType);
    addFieldRow(doc, 'Status', form.status);
    addFieldRow(doc, 'Reporting Period', `${fmtDate(form.reportingPeriodStart)} - ${fmtDate(form.reportingPeriodEnd)}`);

    // Auto-populated Data
    addSectionTitle(doc, 'Auto-Populated Data');
    for (const [key, value] of Object.entries(autoData)) {
      if (['firmName', 'firmFrn', 'reportingPeriod'].includes(key)) continue;
      if (typeof value === 'object' && value !== null) {
        addFieldRow(doc, formatFieldName(key), JSON.stringify(value).substring(0, 100));
      } else {
        const displayValue = typeof value === 'number' ? fmtNum(value) : String(value ?? 'N/A');
        addFieldRow(doc, formatFieldName(key), displayValue);
      }
    }

    // Manual Fields Required
    if (manualFields.length > 0) {
      addSectionTitle(doc, 'Manual Fields Required');
      for (const field of manualFields) {
        addFieldRow(doc, field.description, '[TO BE COMPLETED]', true);
      }
    }

    addFooter(doc, form.formType);
    doc.end();
  });
}

export async function exportFormData(firmId: string, formId: string) {
  const form = await prisma.fcaFormSubmission.findFirst({
    where: { id: formId, firmId },
  });
  if (!form) throw new Error('FCA form not found');

  return {
    id: form.id,
    formType: form.formType,
    status: form.status,
    reportingPeriod: {
      start: form.reportingPeriodStart,
      end: form.reportingPeriodEnd,
    },
    autoPopulatedData: form.autoPopulatedData,
    manualFields: form.manualFields,
    notes: form.notes,
    createdAt: form.createdAt,
    updatedAt: form.updatedAt,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getFormTitle(formType: string): string {
  switch (formType) {
    case 'FSA056': return 'FSA056 - Authorised PI Capital Adequacy Return';
    case 'FSA057': return 'FSA057 - PSD Transaction Return';
    case 'FIN060A': return 'FIN060a - Authorised EMI Quarterly Return';
    default: return `FCA Form - ${formType}`;
  }
}

function formatFieldName(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim();
}
